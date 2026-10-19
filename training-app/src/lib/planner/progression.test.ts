import { describe, expect, it } from "vitest";
import { getExercise } from "@/lib/catalog/exercises";
import type { ExerciseDef } from "@/lib/types";
import { decideNextLoad, estimateStartWeight, liftClass, progressionProfile, stepFor, type PastSession } from "./progression";
import { PERSONAS, SIM_EXERCISES, simulate, summarize } from "./simulate";

const def = (id: string) => getExercise(id) as ExerciseDef;
const ok = (weight: number, reps: number): PastSession => ({ weight, reps, outcome: { allDone: true, success: true, missed: false, unreported: false } });
const miss = (weight: number, reps: number): PastSession => ({ weight, reps, outcome: { allDone: true, success: false, missed: true, unreported: false } });
const partial = (weight: number, reps: number): PastSession => ({ weight, reps, outcome: { allDone: false, success: false, missed: false, unreported: false } });

describe("重量の進め方のルール", () => {
  const beginner = progressionProfile(def("leg_press"), { experience: "beginner" });

  it("予定のセットを全部終えていなければ上げない（以前は終えたセットだけで判定して上がっていた）", () => {
    const r = decideNextLoad(def("leg_press"), [partial(50, 12)], 5, beginner);
    expect(r.kind).toBe("hold");
    expect(r.weight).toBe(50);
    expect(r.notes[0]).toContain("全部終えていない");
  });

  it("初心者は全セット達成で次回は1段階上げる。刻みは店舗の設定に従い、新しい重量でこなせる回数にする", () => {
    expect(decideNextLoad(def("leg_press"), [ok(100, 12)], 5, beginner)).toMatchObject({ kind: "increase_weight", weight: 105, reps: 9 });
    expect(decideNextLoad(def("leg_press"), [ok(100, 12)], 2.5, beginner)).toMatchObject({ kind: "increase_weight", weight: 102.5, reps: 10 });
  });

  it("新しい重量では回数の下限に届きそうにないときは、先に回数を増やしてから上げる", () => {
    const r = decideNextLoad(def("leg_press"), [ok(50, 12)], 5, beginner);
    expect(r).toMatchObject({ kind: "increase_reps", weight: 50, reps: 13 });
    expect(r.notes[0]).toContain("55kg");
    expect(decideNextLoad(def("leg_press"), [ok(50, 15)], 5, beginner)).toMatchObject({ kind: "increase_weight", weight: 55, reps: 8 });
  });

  it("目標に届かなかったら据え置き、2回続けて届かなければ約10%下げる（刻みの倍数）", () => {
    expect(decideNextLoad(def("leg_press"), [miss(60, 12)], 5, beginner)).toMatchObject({ kind: "hold", weight: 60 });
    const d = decideNextLoad(def("leg_press"), [miss(60, 12), miss(60, 12)], 5, beginner);
    expect(d.kind).toBe("deload");
    expect(d.weight).toBe(55);
    expect(decideNextLoad(def("chest_press"), [miss(30, 12), miss(30, 12)], 2.5, beginner).weight).toBe(27.5);
  });

  it("中級者以上は回数を上限まで増やしてから重量を上げ、回数を下限に戻す", () => {
    const p = progressionProfile(def("chest_press"), { experience: "intermediate" });
    expect(p.repRange).toEqual([8, 12]);
    expect(decideNextLoad(def("chest_press"), [ok(40, 10)], 5, p)).toMatchObject({ kind: "increase_reps", weight: 40, reps: 11 });
    expect(decideNextLoad(def("chest_press"), [ok(40, 13)], 2.5, p)).toMatchObject({ kind: "increase_weight", weight: 42.5, reps: 8 });
  });

  it("刻みが今の重量に対して大きいときは、初心者でも先に回数を増やす（4kg のサイドレイズに +2kg など）", () => {
    const p = progressionProfile(def("db_lateral_raise"), { experience: "beginner" });
    const r = decideNextLoad(def("db_lateral_raise"), [ok(4, 12)], 2, p);
    expect(r.kind).toBe("increase_reps");
    expect(r.notes[0]).toContain("+50%");
    // 回数の上限を少し超えて（20回まで）伸ばし、新しい重量でもこなせる力がついたら上げる
    expect(decideNextLoad(def("db_lateral_raise"), [ok(4, 15)], 2, p).kind).toBe("increase_reps");
    // 20回でも 6kg は明らかに重いので据え置き、20回を3回続けて楽にこなせたら挑戦する
    expect(decideNextLoad(def("db_lateral_raise"), [ok(4, 20)], 2, p).kind).toBe("hold");
    const up = decideNextLoad(def("db_lateral_raise"), [ok(4, 20), ok(4, 20), ok(4, 20)], 2, p);
    expect(up).toMatchObject({ kind: "increase_weight", weight: 6, reps: 10 });
    expect(up.notes.join("")).toContain("刻みが大きい");
  });

  it("回数を伸ばしきっても次の重量が明らかに重すぎる刻みなら、上げて失敗を繰り返さず据え置いて刻みの見直しを勧める", () => {
    const p = progressionProfile(def("chest_press"), { experience: "new" });
    const r = decideNextLoad(def("chest_press"), [ok(5, 17)], 5, p);
    expect(decideNextLoad(def("chest_press"), [ok(5, 17), ok(5, 17), ok(5, 17)], 5, p).kind).toBe("increase_weight");
    expect(r).toMatchObject({ kind: "hold", weight: 5 });
    expect(r.notes[0]).toContain("刻み");
  });

  it("上級者・50歳以上・軽め希望は続けて達成してから上げる", () => {
    const adv = progressionProfile(def("leg_press"), { experience: "advanced" });
    expect(adv.requiredSuccesses).toBe(2);
    const p = { ...adv, doubleProgression: false };
    expect(decideNextLoad(def("leg_press"), [ok(100, 12)], 5, p).kind).toBe("hold");
    expect(decideNextLoad(def("leg_press"), [ok(100, 12), ok(100, 12)], 5, p).kind).toBe("increase_weight");
    expect(progressionProfile(def("leg_press"), { experience: "beginner", age: 62 }).requiredSuccesses).toBe(2);
    expect(progressionProfile(def("leg_press"), { experience: "advanced", age: 62, intensity: "light" }).requiredSuccesses).toBe(3);
  });

  it("補助つきの種目は補助を減らす方向に進め、下げるときは補助を増やす", () => {
    const p = progressionProfile(def("assisted_chin"), { experience: "beginner" });
    expect(decideNextLoad(def("assisted_chin"), [ok(30, 8)], 5, p)).toMatchObject({ kind: "increase_weight", weight: 25 });
    expect(decideNextLoad(def("assisted_chin"), [miss(30, 8), miss(30, 8)], 5, p).weight).toBeGreaterThan(30);
  });

  it("筋力重視・軽め希望で回数の範囲が変わる。種目の分類", () => {
    expect(progressionProfile(def("leg_press"), {}, { priorityRegions: [], objectives: ["strength"], weakSide: "none", favoriteExerciseIds: [], runStartSpeedKmh: 8 }).repRange).toEqual([5, 8]);
    expect(progressionProfile(def("leg_press"), { intensity: "light" }).repRange).toEqual([12, 15]);
    expect(liftClass(def("leg_press"))).toBe("lower_compound");
    expect(liftClass(def("db_lateral_raise"))).toBe("isolation");
    expect(liftClass(def("abdominal"))).toBe("core");
  });

  it("体重・性別・経験・年齢から初めての重量の目安を出す（刻みの倍数、体重が無ければ出さない）", () => {
    const m = estimateStartWeight(def("chest_press"), { bodyWeightKg: 70, sex: "male", experience: "beginner" }, 5)!;
    const f = estimateStartWeight(def("chest_press"), { bodyWeightKg: 70, sex: "female", experience: "beginner" }, 5)!;
    const old = estimateStartWeight(def("chest_press"), { bodyWeightKg: 70, sex: "male", experience: "beginner", age: 70 }, 5)!;
    expect(m % 5).toBe(0);
    expect(f).toBeLessThan(m);
    expect(old).toBeLessThan(m);
    expect(estimateStartWeight(def("chest_press"), {}, 5)).toBeUndefined();
  });

  it("店舗・器具ごとの刻みを使い、無ければ種目の標準", () => {
    const eq = [{ key: "ichijoji:dumbbells", storeId: "ichijoji", equipmentId: "dumbbells", available: true, confirmed: true, stepKg: 2, updatedAt: "" }];
    expect(stepFor(def("db_curl_single"), "ichijoji", eq)).toBe(2);
    expect(stepFor(def("db_curl_single"), "sanjo-ohashi", eq)).toBe(1);
  });
});

describe("シミュレーション：あらゆる人物像 × 種目 × 刻みで 24 回続けたとき", () => {
  const results = PERSONAS.flatMap((persona, pi) =>
    SIM_EXERCISES.flatMap((exerciseId, ei) =>
      [undefined, exerciseId.startsWith("db_") ? 2 : 2.5].map((step, si) => simulate(persona, exerciseId, { step, seed: 1000 + pi * 97 + ei * 13 + si })),
    ),
  );

  it(`${results.length} 通りすべてで、重量は刻みの倍数・1回に上げるのは1段階まで・届かなかった/途中でやめた次の回は上げない`, () => {
    for (const r of results) {
      r.sessions.forEach((s, i) => {
        const k = s.weight / r.step;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
        expect(s.weight).toBeGreaterThanOrEqual(r.step);
        if (i === 0) return;
        const prev = r.sessions[i - 1];
        const assist = r.exerciseId === "assisted_chin";
        const harder = assist ? s.weight < prev.weight : s.weight > prev.weight;
        if (harder) {
          expect(Math.abs(s.weight - prev.weight)).toBeLessThanOrEqual(r.step + 1e-6);
          expect(prev.success).toBe(true);
        }
        if (s.reps > prev.reps && s.weight === prev.weight) expect(prev.success).toBe(true);
        if (!prev.success) expect(s.kind === "increase_weight" || s.kind === "increase_reps").toBe(false);
      });
    }
  });

  it("目標回数はいつも回数の範囲内（刻みが大きいときだけ上限を最大5回超える・20回まで）", () => {
    for (const r of results) for (const s of r.sessions.slice(1)) {
      expect(s.reps).toBeGreaterThanOrEqual(r.repRange[0]);
      expect(s.reps).toBeLessThanOrEqual(Math.min(20, r.repRange[1] + 5));
    }
  });

  const groups = ["new", "beginner", "intermediate", "advanced"] as const;
  const stats = (pred: (r: (typeof results)[number]) => boolean) => {
    const xs = results.filter(pred).map(summarize);
    const avg = (k: keyof ReturnType<typeof summarize>) => xs.reduce((a, x) => a + x[k], 0) / xs.length;
    const ratios = xs.map((x) => x.loadRatio).sort((a, b) => a - b);
    return { planGrow: avg("planGrow"), trueGrow: avg("trueGrow"), loadRatio: avg("loadRatio"), p95: ratios[Math.floor(ratios.length * 0.95)], missRate: avg("missRate") };
  };

  it("無理な重量が続かない：目標に届かない回は平均 30% 未満、2回続けて届かなければ下げている", () => {
    for (const g of groups) expect(stats((r) => r.persona.experience === g).missRate).toBeLessThan(0.3);
    for (const r of results) {
      for (let i = 2; i < r.sessions.length; i++) {
        const a = r.sessions[i - 2];
        const b = r.sessions[i - 1];
        if (a.missed && b.missed && a.weight === b.weight) expect(r.sessions[i].kind).toBe("deload");
      }
    }
  });

  it("重さがその人の力に合っている：終盤の予定の負荷は本当の筋力の 75〜95%（重すぎる人は上位 5% でも 115% 未満）", () => {
    for (const g of groups)
      for (const old of [false, true]) {
        const st = stats((r) => r.persona.experience === g && r.persona.age >= 50 === old);
        expect(st.loadRatio).toBeGreaterThan(0.75);
        expect(st.loadRatio).toBeLessThan(0.95);
        expect(st.p95).toBeLessThan(1.15);
      }
  });

  it("重量の伸びが本当の筋力の伸びに沿っている（差は 5 ポイント以内）。伸びるペースは はじめて > 初心者 > 中級 > 上級", () => {
    const g = Object.fromEntries(groups.map((x) => [x, stats((r) => r.persona.experience === x)]));
    for (const x of groups) expect(Math.abs(g[x].planGrow - g[x].trueGrow)).toBeLessThan(0.05);
    expect(g.new.planGrow).toBeGreaterThan(g.beginner.planGrow);
    expect(g.beginner.planGrow).toBeGreaterThan(g.intermediate.planGrow);
    expect(g.intermediate.planGrow).toBeGreaterThan(g.advanced.planGrow);
    // 初心者でも 24 回で 1.5 倍を超えるような無茶な伸び方はしない
    expect(g.new.planGrow).toBeLessThan(0.5);
  });

  it("50歳以上は同じ経験の若い人より上げるペースがゆっくり", () => {
    const gain = (age: number) => {
      const xs = results.filter((r) => r.persona.age === age && r.persona.experience === "beginner").map((r) => summarize(r).weightIncreases);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(gain(60)).toBeLessThan(gain(25));
  });
});
