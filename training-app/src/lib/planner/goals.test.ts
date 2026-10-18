import { describe, expect, it } from "vitest";
import { generatePlan } from "./index";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { DEFAULT_GOALS, OWNER_GOALS } from "@/lib/goals";
import type { Goals, IntakeAnswers } from "@/lib/types";
import { planRunMin } from "./cardio";

const equipment = defaultStoreEquipment();
const now = new Date("2026-10-18T10:00:00+09:00");
const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: 90, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "run" };

function plan(goals: Goals, history = buildSeedWorkouts()) {
  return generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [], goals }, now }).workout;
}

describe("人ごとの目標", () => {
  it("履歴なしの新しい利用者でもメニューが作れ、重量は未設定（初回確認）", () => {
    const w = plan(DEFAULT_GOALS, []);
    expect(w.exercises.length).toBeGreaterThanOrEqual(5);
    expect(w.exercises.every((e) => e.weightReference === "none")).toBe(true);
    expect(w.exercises.find((e) => e.exerciseId === "leg_press")!.sets[0].weight).toBeUndefined();
  });

  it("ランニング実績がなければ設定した開始速度から", () => {
    const w = plan({ ...DEFAULT_GOALS, runStartSpeedKmh: 8.5, objectives: ["running"] }, []);
    const tm = w.cardio.find((c) => c.machine === "treadmill")!;
    expect(tm.plan.find((s) => s.kind === "run")!.speedKmh).toBe(8.5);
  });

  it("有酸素を目標にしない人は有酸素の時間が短い", () => {
    const short = plan({ ...DEFAULT_GOALS, objectives: ["hypertrophy"] }, []);
    const long = plan({ ...DEFAULT_GOALS, objectives: ["fatloss"] }, []);
    const total = (w: ReturnType<typeof plan>) => w.cardio.find((c) => c.machine === "treadmill")!.plan.reduce((a, s) => a + s.durationSec, 0);
    expect(total(short)).toBeLessThan(total(long));
    expect(planRunMin(long.cardio.find((c) => c.machine === "treadmill")!.plan)).toBeGreaterThan(0);
  });

  it("筋力向上のみなら主要種目は8回", () => {
    const w = plan({ ...DEFAULT_GOALS, objectives: ["strength"] });
    expect(w.exercises.find((e) => e.exerciseId === "leg_press")!.sets[0].reps).toBe(8);
    expect(plan(DEFAULT_GOALS).exercises.find((e) => e.exerciseId === "leg_press")!.sets[0].reps).toBe(12);
  });

  it("弱い側の説明は設定に従う", () => {
    const left = plan(OWNER_GOALS).exercises.find((e) => e.exerciseId === "db_hammer_curl_single");
    expect(left?.rationale).toMatch(/弱い左から/);
    const none = generatePlan({ intake: { ...intake, storeId: "higashiyama-nijo", timeLimitMin: null }, history: buildSeedWorkouts(), storeEquipment: equipment, settings: { excludedExerciseIds: [], goals: DEFAULT_GOALS }, now }).workout;
    const dc = none.exercises.find((e) => e.exerciseId === "db_curl_single");
    expect(dc?.rationale).toMatch(/左右同じ/);
  });

  it("定期的に入れたい種目は優先される", () => {
    const at60 = (goals: Goals) => generatePlan({ intake: { ...intake, timeLimitMin: 60 }, history: buildSeedWorkouts(), storeEquipment: equipment, settings: { excludedExerciseIds: [], goals }, now }).workout.exercises.map((e) => e.exerciseId);
    expect(at60(DEFAULT_GOALS)).not.toContain("shoulder_press");
    expect(at60({ ...DEFAULT_GOALS, favoriteExerciseIds: ["shoulder_press"] })).toContain("shoulder_press");
  });
});
