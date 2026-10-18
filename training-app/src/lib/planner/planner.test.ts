import { describe, expect, it } from "vitest";
import { generatePlan } from "./index";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import type { IntakeAnswers } from "@/lib/types";
import { nextRunTarget, buildTreadmillPlan, planRunMin, planTotalMin, decideTreadmillMode } from "./cardio";
import { runHistory } from "./history";

const history = buildSeedWorkouts();
const equipment = defaultStoreEquipment();
const now = new Date("2026-10-18T10:00:00+09:00");

const base: IntakeAnswers = {
  storeId: "ichijoji",
  timeLimitMin: 90,
  condition: 4,
  soreness: false,
  soreRegions: [],
  pain: { present: false },
  focus: "auto",
  cardio: "run",
};

function plan(over: Partial<IntakeAnswers> = {}) {
  return generatePlan({ intake: { ...base, ...over }, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
}

describe("generatePlan", () => {
  it("90分・一乗寺・おまかせで主要種目と有酸素を含むプランを作る", () => {
    const { workout } = plan();
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).toContain("leg_press");
    expect(ids).toContain("chest_press");
    expect(ids).toContain("lat_pulldown");
    expect(ids).toContain("seated_row");
    expect(ids).toContain("abdominal");
    expect(workout.cardio.map((c) => c.machine)).toEqual(["bike", "treadmill"]);
    expect(workout.status).toBe("active");
    expect(workout.trainingDate).toBe("2026-10-18");
    // バードドッグは存在しない
    expect(ids).not.toContain("bird_dog");
  });

  it("前回の実回数が未報告なら重量を据え置く（目標達成とみなさない）", () => {
    const { workout } = plan();
    const lp = workout.exercises.find((e) => e.exerciseId === "leg_press")!;
    // 前回(10/15 一乗寺) 40,50,50 → ワーキング 50 を据え置き。1セット目はランプで 45
    expect(lp.sets.map((s) => s.weight)).toEqual([45, 50, 50]);
    expect(lp.weightReference).toBe("same_store");
    expect(lp.rationale).toMatch(/据え置き/);
  });

  it("東山二条ではバイセップスカールマシンが無いので片手ダンベルカールになる", () => {
    const { workout } = plan({ storeId: "higashiyama-nijo", timeLimitMin: null });
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("biceps_curl");
    expect(ids).toContain("db_curl_single");
    const dc = workout.exercises.find((e) => e.exerciseId === "db_curl_single")!;
    expect(dc.sets[0].left?.weight).toBeDefined();
    expect(dc.sets[0].right?.weight).toBeDefined();
  });

  it("別店舗の記録しか無い種目は参考値として1段階軽くする", () => {
    // 三条大橋でチェストプレス（三条では実績なし。一乗寺の 30,35 が参考）
    const { workout } = plan({ storeId: "sanjo-ohashi", timeLimitMin: 60, cardio: "walk" });
    const cp = workout.exercises.find((e) => e.exerciseId === "chest_press");
    expect(cp).toBeDefined();
    expect(cp!.weightReference).toBe("other_store");
    const last = cp!.sets[cp!.sets.length - 1].weight!;
    expect(last).toBeLessThan(35);
  });

  it("強い筋肉痛の部位は休ませる", () => {
    const { workout, warnings } = plan({ soreness: true, soreRegions: ["legs"], soreLevel: "severe" });
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("leg_press");
    expect(ids).not.toContain("leg_curl");
    expect(warnings.some((w) => w.includes("休ませ"))).toBe(true);
    // ランニングもウォーキングに変更
    const tm = workout.cardio.find((c) => c.machine === "treadmill")!;
    expect(tm.plan.some((s) => s.kind === "run")).toBe(false);
  });

  it("中程度の疲労は負荷を下げる", () => {
    const { workout } = plan({ soreness: true, soreRegions: ["chest"], soreLevel: "moderate", timeLimitMin: null });
    const cp = workout.exercises.find((e) => e.exerciseId === "chest_press")!;
    expect(cp.sets[cp.sets.length - 1].weight!).toBeLessThan(35);
  });

  it("30分なら種目数を絞る", () => {
    const { workout } = plan({ timeLimitMin: 30 });
    expect(workout.exercises.length).toBeLessThanOrEqual(5);
    expect(workout.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it("制限なしでもセット数を増やしすぎない", () => {
    const { workout } = plan({ timeLimitMin: null });
    expect(workout.exercises.length).toBeLessThanOrEqual(12);
    expect(Math.max(...workout.exercises.map((e) => e.sets.length))).toBeLessThanOrEqual(3);
  });

  it("腰の痛みがあればレッグプレスなどを除外する", () => {
    const { workout } = plan({ pain: { present: true, description: "腰に違和感" } });
    expect(workout.exercises.map((e) => e.exerciseId)).not.toContain("leg_press");
  });

  it("除外設定した種目は提案しない", () => {
    const r = generatePlan({ intake: base, history, storeEquipment: equipment, settings: { excludedExerciseIds: ["pec_fly"] }, now });
    expect(r.workout.exercises.map((e) => e.exerciseId)).not.toContain("pec_fly");
  });

  it("重点部位：下半身なら脚種目が優先される", () => {
    const { workout } = plan({ focus: "lower", timeLimitMin: 45 });
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).toContain("leg_press");
    expect(ids).toContain("leg_curl");
    expect(ids).toContain("abductor");
  });
});

describe("cardio progression", () => {
  it("前回 12km/h 9分 → 速度据え置きで時間を伸ばす", () => {
    const t = nextRunTarget(runHistory(history));
    expect(t.speedKmh).toBe(12);
    expect(t.totalRunMin).toBeGreaterThan(9);
    expect(t.totalRunMin).toBeLessThanOrEqual(12);
  });
  it("区間表は予算に収まる", () => {
    const t = nextRunTarget(runHistory(history));
    const plan = buildTreadmillPlan("run", 25, t);
    expect(planTotalMin(plan)).toBeLessThanOrEqual(25);
    expect(planRunMin(plan)).toBe(t.totalRunMin);
    expect(plan[0].kind).toBe("walk");
    expect(plan[plan.length - 1].kind).toBe("cooldown");
  });
  it("ランニング希望でも脚の中程度疲労ならウォーキングに変更", () => {
    expect(decideTreadmillMode({ ...base, soreness: true, soreRegions: ["legs"], soreLevel: "moderate" }).mode).toBe("walk");
    expect(decideTreadmillMode(base).mode).toBe("run");
  });
});
