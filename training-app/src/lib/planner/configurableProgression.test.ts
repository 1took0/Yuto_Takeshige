import { describe, expect, it } from "vitest";
import { getExercise } from "@/lib/catalog/exercises";
import { DEFAULT_GOALS } from "@/lib/goals";
import type { AiProgressionPolicy, ExerciseDef, IntakeAnswers, MenuPreferences, StoreEquipment, Workout } from "@/lib/types";
import { buildExercise } from "@/lib/workout/edit";
import { generatePlan, planSingleExercise } from "./index";
import { allowedReps, decideNextLoad, progressionProfile, validatedProgressionPolicy, type PastSession } from "./progression";

const def = (id = "chest_press") => getExercise(id) as ExerciseDef;
const success = (weight: number, reps = 12): PastSession => ({ weight, reps,
  outcome: { allDone: true, success: true, missed: false, unreported: false } });
const missed = (weight: number, reps = 12): PastSession => ({ ...success(weight, reps),
  outcome: { allDone: true, success: false, missed: true, unreported: false } });
const partial = (weight: number, reps = 12): PastSession => ({ ...success(weight, reps),
  outcome: { allDone: false, success: false, missed: false, unreported: false } });
const unreported = (weight: number, reps = 12): PastSession => ({ ...success(weight, reps),
  outcome: { allDone: true, success: false, missed: false, unreported: true } });
const profile = (progression: AiProgressionPolicy, prefs: MenuPreferences = {}, id?: string) => progressionProfile(def(id), { ...prefs, progression });

function record(day: number, { id = "chest_press", storeId = "A", weight = 100, target = 12, actual = target }: {
  id?: string; storeId?: string; weight?: number; target?: number; actual?: number;
} = {}): Workout {
  const exercise = buildExercise(def(id), { sets: 3, weight, reps: target, recordPlan: true });
  exercise.sets = exercise.sets.map((s) => ({ ...s, completed: true, actualReps: actual,
    left: s.left ? { ...s.left, actualReps: actual } : undefined,
    right: s.right ? { ...s.right, actualReps: actual } : undefined }));
  const date = `2026-10-${String(day).padStart(2, "0")}`;
  return { id: `${storeId}-${day}`, storeId, trainingDate: date, startedAt: `${date}T01:00:00Z`,
    createdAt: date, updatedAt: date, status: "completed", source: "app", exercises: [exercise], cardio: [] };
}

function plan(history: Workout[], preferences: MenuPreferences, id = "chest_press", storeId = "A", stepKg = 5) {
  const equipmentId = def(id).equipmentId;
  const storeEquipment: StoreEquipment[] = [{ key: `${storeId}:${equipmentId}`, storeId, equipmentId,
    available: true, confirmed: true, stepKg, updatedAt: "synthetic" }];
  return planSingleExercise(id, { history, storeId, storeEquipment, settings: { preferences } })!;
}

const loadOf = (exercise: ReturnType<typeof plan>) => exercise.sets.at(-1)!.weight;

describe("相談した進め方の入力と安全条件", () => {
  it("回数範囲を正確に採用し、年齢・経験・軽めの成功回数を緩めない", () => {
    const prefs: MenuPreferences = { experience: "advanced", age: 62, intensity: "light" };
    const p = profile({ requiredSuccesses: 1, strategy: "weight_first", repRange: { min: 6, max: 9 } }, prefs);
    expect(p.requiredSuccesses).toBe(3);
    expect(p.repRange).toEqual([6, 9]);
    expect(allowedReps(p)).toEqual([6, 9]);
    expect(p.doubleProgression).toBe(false);
    expect(p.maxJump).toBe(progressionProfile(def(), prefs).maxJump);
    expect(profile({ requiredSuccesses: 5 }).requiredSuccesses).toBe(5);
  });

  it.each([null, {}, [], { requiredSuccesses: 0 }, { requiredSuccesses: 6 }, { requiredSuccesses: 1.5 },
    { minSessionsAtWeight: 9 }, { maxIncreasePercent: NaN }, { maxIncreasePercent: Infinity },
    { maxIncreasePercent: 0.5 }, { maxIncreasePercent: 21 }, { strategy: "fast" },
    { repRange: { min: 12, max: 6 } }, { repRange: { min: 2.5, max: 6 } },
    { repRange: { min: 1, max: 21 } }, { repRange: { min: 1, max: 6, extra: true } },
    { requiredSuccesses: 2, rpe: 8 }, { requiredSuccesses: undefined }])("検証を経ない不正な保存値 %j は使わない", (value) => {
    expect(validatedProgressionPolicy(value)).toBeUndefined();
    expect(progressionProfile(def(), { progression: value as AiProgressionPolicy })).toEqual(progressionProfile(def()));
  });

  it("小数の変更率を許可し、自重回数・時間種目には重量の相談条件を適用しない", () => {
    expect(validatedProgressionPolicy({ maxIncreasePercent: 2.5 })).toEqual({ maxIncreasePercent: 2.5 });
    for (const id of ["knee_leg_raise", "plank"]) {
      expect(profile({ requiredSuccesses: 5, repRange: { min: 1, max: 2 } }, {}, id)).toEqual(progressionProfile(def(id)));
    }
  });
});

describe("成功の連続回数と同じ重量の練習回数", () => {
  it("必要成功数は同じ重量での連続成功で、違う重量・失敗・未報告・未完了で途切れる", () => {
    const p = profile({ requiredSuccesses: 3 });
    expect(decideNextLoad(def(), Array.from({ length: 3 }, () => success(100)), 5, p).weight).toBe(105);
    for (const interruption of [success(95), missed(100), partial(100), unreported(100)]) {
      expect(decideNextLoad(def(), [success(100), interruption, success(100), success(100)], 5, p).kind).toBe("hold");
    }
    expect(decideNextLoad(def(), [success(100), success(100)], 5, p).kind).toBe("hold");
  });

  it("滞在回数には全セットを報告した失敗回も数え、成功の連続回数とは区別する", () => {
    const p = profile({ requiredSuccesses: 2, minSessionsAtWeight: 3 });
    expect(decideNextLoad(def(), [success(100), success(100)], 5, p)).toMatchObject({ kind: "hold", weight: 100 });
    expect(decideNextLoad(def(), [success(100), success(100), missed(100)], 5, p)).toMatchObject({ kind: "increase_weight", weight: 105 });
    for (const interruption of [partial(100), unreported(100), success(95)]) {
      expect(decideNextLoad(def(), [success(100), success(100), interruption, success(100)], 5, p).weight).toBe(100);
    }
  });

  it("重量を変えるまでの滞在回数と変更率は、同じ重量での回数練習を止めない", () => {
    for (const policy of [{ minSessionsAtWeight: 8 }, { maxIncreasePercent: 1 }]) {
      expect(decideNextLoad(def(), [success(100, 10)], 5, profile({ ...policy, strategy: "reps_first" })))
        .toMatchObject({ kind: "increase_reps", weight: 100, reps: 11 });
    }
  });

  it("他店舗の成功や滞在回数を混ぜず、次回の作成だけに反映する", () => {
    const a = record(22);
    const b = record(23, { storeId: "B" });
    const history = [a, b];
    const preferences: MenuPreferences = { progression: { requiredSuccesses: 2, minSessionsAtWeight: 2 } };
    const before = JSON.stringify({ history, preferences });
    expect(loadOf(plan(history, preferences))).toBe(100);
    expect(loadOf(plan([...history, record(21)], preferences))).toBe(105);
    expect(JSON.stringify({ history, preferences })).toBe(before);
  });
});

describe("店舗の1段階と変更率の上限", () => {
  it("変更率2.5%の境界を含み、店舗の1段階そのものを小さくしない", () => {
    const history = [success(100)];
    const p = profile({ maxIncreasePercent: 2.5 });
    expect(decideNextLoad(def(), history, 2.5, p)).toMatchObject({ kind: "increase_weight", weight: 102.5 });
    expect(decideNextLoad(def(), history, 5, p)).toMatchObject({ kind: "hold", weight: 100 });
  });

  it("上限回数を何度達成しても、大きすぎる刻みを上限変更率の外で試さない", () => {
    const history = Array.from({ length: 5 }, () => success(4, 20));
    expect(decideNextLoad(def("db_lateral_raise"), history, 2, profile({ maxIncreasePercent: 20 }, {}, "db_lateral_raise")))
      .toMatchObject({ kind: "hold", weight: 4, reps: 15 });
    // 設定の無い従来動作は、そのまま3回の上限達成で試す。
    expect(decideNextLoad(def("db_lateral_raise"), history, 2, progressionProfile(def("db_lateral_raise"))))
      .toMatchObject({ kind: "increase_weight", weight: 6, reps: 10 });
  });

  it("独立した算術条件：増量が出るなら、変更は店舗の1段階かつ指定割合以下", () => {
    let increases = 0;
    for (const id of ["chest_press", "assisted_chin"]) for (const step of [1, 2.5, 5]) {
      for (const weight of [20, 50, 100]) for (const cap of [1, 2.5, 5, 10, 20]) {
        const result = decideNextLoad(def(id), [success(weight, 12)], step,
          profile({ strategy: "weight_first", maxIncreasePercent: cap }, {}, id));
        if (result.kind !== "increase_weight") continue;
        increases++;
        const change = Math.abs(result.weight! - weight);
        expect(change).toBeCloseTo(step, 9);
        expect(change * 100).toBeLessThanOrEqual(weight * cap + 1e-7);
        expect(Math.sign(result.weight! - weight)).toBe(id === "assisted_chin" ? -1 : 1);
      }
    }
    expect(increases).toBeGreaterThan(0);
  });

  it("補助種目も回数優先・滞在・変更率を守り、成功で補助を減らし、連続失敗で増やす", () => {
    const d = def("assisted_chin");
    const p = profile({ strategy: "reps_first", minSessionsAtWeight: 2, maxIncreasePercent: 10, repRange: { min: 8, max: 10 } }, {}, d.id);
    expect(decideNextLoad(d, [success(50, 8)], 5, p)).toMatchObject({ kind: "increase_reps", weight: 50, reps: 9 });
    expect(decideNextLoad(d, [success(50, 10)], 5, p)).toMatchObject({ kind: "hold", weight: 50 });
    expect(decideNextLoad(d, [success(50, 10), success(50, 10)], 5, p)).toMatchObject({ kind: "increase_weight", weight: 45 });
    expect(decideNextLoad(d, [success(40, 10), success(40, 10)], 5, p)).toMatchObject({ kind: "hold", weight: 40 });
    expect(decideNextLoad(d, [missed(50, 8), missed(50, 8)], 5, p)).toMatchObject({ kind: "deload", weight: 55 });
  });
});

describe("回数範囲・固定回数と実績の区別", () => {
  it("新しい回数下限を未報告・未完了・未達成の実績へ勝手に適用せず、成功後も1回ずつ進める", () => {
    const p = profile({ repRange: { min: 12, max: 15 } });
    for (const session of [unreported(100, 5), partial(100, 5), missed(100, 5)]) {
      expect(decideNextLoad(def(), [session], 5, p)).toMatchObject({ kind: "hold", weight: 100, reps: 5 });
    }
    expect(decideNextLoad(def(), [success(100, 5)], 5, p)).toMatchObject({ kind: "increase_reps", weight: 100, reps: 6 });
    const old = record(24, { target: 5 });
    old.exercises[0].sets.forEach((s) => { s.actualReps = undefined; });
    const ex = plan([old], { progression: { repRange: { min: 12, max: 15 } } });
    expect(ex.sets.every((s) => s.reps === 5 && s.plannedReps === 5)).toBe(true);
    expect(plan([], { progression: { repRange: { min: 4, max: 6 } } }).sets[0].reps).toBe(6);
  });

  it("重量優先でも見込み不足を飛び越さず、範囲の上限を超える目標を作らない", () => {
    const p = profile({ strategy: "weight_first", repRange: { min: 8, max: 12 } });
    expect(decideNextLoad(def(), [success(50, 12)], 5, p)).toMatchObject({ kind: "hold", weight: 50, reps: 12 });
    expect(decideNextLoad(def(), [success(100, 12)], 5, p)).toMatchObject({ kind: "increase_weight", weight: 105, reps: 9 });
  });

  it("全セットの最小実回数を使い、最後のセットの高い目標だけで余裕を推定しない", () => {
    const history = [record(24)];
    history[0].exercises[0].sets[0] = { ...history[0].exercises[0].sets[0], plannedReps: 8, reps: 8, actualReps: 8 };
    expect(loadOf(plan(history, { progression: { strategy: "weight_first" } }))).toBe(100);
  });

  it("固定回数の旧目標達成や目標変更だけで増量せず、同じ目標の連続達成と実回数の余裕があれば進む", () => {
    const preferences: MenuPreferences = { exerciseRules: [{ exerciseId: "chest_press", reps: 10 }],
      progression: { strategy: "weight_first", requiredSuccesses: 2, minSessionsAtWeight: 2, maxIncreasePercent: 5 } };
    const old = record(23, { target: 12, actual: 15 });
    const matched = record(24, { target: 10, actual: 15 });
    expect(loadOf(plan([old, matched], preferences))).toBe(100);
    const enough = plan([matched, record(23, { target: 10, actual: 15 })], preferences);
    expect(loadOf(enough)).toBe(105);
    expect(enough.sets.every((s) => s.reps === 10 && s.plannedReps === 10)).toBe(true);
    expect(loadOf(plan([record(24, { target: 10 }), record(23, { target: 10 })], preferences))).toBe(100);
    expect(loadOf(plan([matched, record(23, { target: 10, actual: 15 })], { ...preferences, progression: { ...preferences.progression, maxIncreasePercent: 2.5 } }))).toBe(100);
  });

  it("固定回数では全予定セットの一致が必要で、予定のない手動記録も旧目標として使わない", () => {
    const preferences: MenuPreferences = { exerciseRules: [{ exerciseId: "chest_press", reps: 10 }], progression: { strategy: "weight_first" } };
    const mixed = record(24, { target: 10, actual: 15 });
    mixed.exercises[0].sets[0].plannedReps = 9;
    expect(loadOf(plan([mixed], preferences))).toBe(100);
    const manual = record(24, { target: 10, actual: 15 });
    manual.exercises[0].sets.forEach((s) => { s.plannedReps = undefined; });
    expect(loadOf(plan([manual], preferences))).toBe(100);
  });

  it("固定目標の左右別種目は弱い側の実回数の余裕も必要", () => {
    const id = "db_curl_single";
    const preferences: MenuPreferences = { exerciseRules: [{ exerciseId: id, reps: 10 }], progression: { strategy: "weight_first" } };
    const workout = record(24, { id, weight: 10, target: 10, actual: 15 });
    expect(loadOf(plan([workout], preferences, id, "A", 0.5))).toBe(10.5);
    workout.exercises[0].sets[0].left!.actualReps = 10;
    expect(loadOf(plan([workout], preferences, id, "A", 0.5))).toBe(10);
    workout.exercises[0].sets[0].left!.actualReps = undefined;
    expect(loadOf(plan([workout], preferences, id, "A", 0.5))).toBe(10);
  });

  it("自動増加停止が相談条件に優先し、連続失敗の軽減を止めない", () => {
    const preferences: MenuPreferences = { progressionMode: "hold", exerciseRules: [{ exerciseId: "chest_press", reps: 10 }],
      progression: { strategy: "weight_first", requiredSuccesses: 1, maxIncreasePercent: 20 } };
    expect(loadOf(plan([record(24, { target: 10, actual: 15 })], preferences))).toBe(100);
    expect(loadOf(plan([record(24, { target: 10, actual: 8 }), record(23, { target: 10, actual: 8 })], preferences))).toBe(90);
  });
});

describe("メニュー全体の保護と既存動作", () => {
  it("疲労・久しぶり・刻み不一致・直近の重量未入力を増量条件で上書きしない", () => {
    const history = [record(24)];
    const preferences: MenuPreferences = { progression: { strategy: "weight_first" } };
    const equipmentId = def().equipmentId;
    const make = (condition: IntakeAnswers["condition"], currentHistory = history) => generatePlan({
      now: new Date("2026-10-25T12:00:00+09:00"), history: currentHistory,
      intake: { storeId: "A", timeLimitMin: 90, condition, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "none" },
      settings: { excludedExerciseIds: [], preferences, goals: DEFAULT_GOALS },
      storeEquipment: [{ key: `A:${equipmentId}`, storeId: "A", equipmentId, available: true, confirmed: true, stepKg: 5, updatedAt: "synthetic" }],
    }).workout.exercises.find((exercise) => exercise.exerciseId === "chest_press")!;
    expect(loadOf(make(2))).toBeLessThanOrEqual(100);
    expect(loadOf(make(4, [record(1)]))).toBeLessThan(100);
    expect(loadOf(plan(history, preferences, "chest_press", "A", 7))).toBe(100);
    const noWeight = record(25);
    noWeight.exercises[0].sets.forEach((s) => { s.weight = undefined; });
    expect(loadOf(plan([...history, noWeight], preferences))).toBe(100);
  });

  it("相談した高回数は時間予算へ先に入れ、採用後にセット数を戻さない", () => {
    const equipmentId = def().equipmentId;
    const result = generatePlan({
      now: new Date("2026-10-25T12:00:00+09:00"), history: [],
      intake: { storeId: "A", timeLimitMin: 15, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "none" },
      settings: { excludedExerciseIds: [], preferences: { exerciseRules: [{ exerciseId: "chest_press", sets: 6 }], progression: { repRange: { min: 18, max: 20 } } }, goals: DEFAULT_GOALS },
      storeEquipment: [{ key: `A:${equipmentId}`, storeId: "A", equipmentId, available: true, confirmed: true, updatedAt: "synthetic" }],
    });
    const exercise = result.workout.exercises.find((item) => item.exerciseId === "chest_press")!;
    expect(exercise.sets).toHaveLength(2);
    expect(exercise.sets[0].reps).toBe(18);
    expect(Number(result.summary[0].match(/約(\d+)分/)![1])).toBeLessThanOrEqual(15);
  });

  it("相談設定が無いときは標準・慎重・停止、固定回数の以前の動作を維持する", () => {
    const history = [record(24)];
    expect(loadOf(plan(history, {}))).toBe(105);
    expect(loadOf(plan(history, { progressionMode: "standard" }))).toBe(105);
    expect(loadOf(plan(history, { progressionMode: "cautious" }))).toBe(100);
    expect(loadOf(plan(history, { progressionMode: "hold" }))).toBe(100);
    expect(loadOf(plan(history, { exerciseRules: [{ exerciseId: "chest_press", reps: 10 }] }))).toBe(100);
    const shape = (exercise: ReturnType<typeof plan>) => ({ ...exercise, id: undefined,
      sets: exercise.sets.map((set) => ({ ...set, id: undefined })) });
    expect(shape(plan(history, { progression: undefined }))).toEqual(shape(plan(history, {})));
  });
});
