import { afterEach, describe, expect, it } from "vitest";
import { getExercise, setDeletedExercises } from "@/lib/catalog/exercises";
import { DEFAULT_GOALS } from "@/lib/goals";
import type { AiExerciseRule, IntakeAnswers, MenuPreferences, StoreEquipment, Workout, WorkoutExercise } from "@/lib/types";
import { buildExercise, orderedItems } from "@/lib/workout/edit";
import { computeBudget, generatePlan, planSingleExercise, type PlanInput } from "./index";
import { decideNextLoad, progressionProfile, type PastSession } from "./progression";

const now = new Date("2026-10-25T12:00:00+09:00");
const intake: IntakeAnswers = {
  storeId: "ichijoji", timeLimitMin: 90, condition: 4, soreness: false,
  soreRegions: [], pain: { present: false }, focus: "auto", cardio: "none",
};

function equipmentFor(ids: string[], storeId = intake.storeId): StoreEquipment[] {
  return [...new Set(ids.map((id) => getExercise(id)!.equipmentId))].map((equipmentId) => ({
    key: `${storeId}:${equipmentId}`, storeId, equipmentId, available: true, confirmed: true, updatedAt: "synthetic",
  }));
}

function record(exerciseId: string, storeId: string, date: string, weight = 100, reps = 12, success = true): Workout {
  const exercise = buildExercise(getExercise(exerciseId)!, { sets: 3, weight, reps, recordPlan: true });
  exercise.sets = exercise.sets.map((s) => ({
    ...s, completed: true, actualReps: success ? reps : reps - 2,
    left: s.left ? { ...s.left, actualReps: success ? reps : reps - 2 } : undefined,
    right: s.right ? { ...s.right, actualReps: success ? reps : reps - 2 } : undefined,
  }));
  return {
    id: `${storeId}-${date}-${exerciseId}`, storeId, storeLabel: "Synthetic gym", trainingDate: date,
    startedAt: `${date}T10:00:00Z`, createdAt: date, updatedAt: date, status: "completed", source: "app",
    exercises: [exercise], cardio: [],
  };
}

function plan(preferences: MenuPreferences = {}, overrides: Partial<PlanInput> = {}) {
  return generatePlan({
    intake, now, history: [], storeEquipment: equipmentFor(["chest_press"]),
    settings: { excludedExerciseIds: [], goals: DEFAULT_GOALS, preferences }, ...overrides,
  });
}

const idsOf = (w: Workout) => w.exercises.map((e) => e.exerciseId);
const workingLoad = (e: WorkoutExercise) => e.sets.at(-1)!.weight;
const ruleFor = (exerciseId: string, rest: Omit<AiExerciseRule, "exerciseId">): MenuPreferences => ({ exerciseRules: [{ exerciseId, ...rest }] });

afterEach(() => setDeletedExercises([]));

describe("相談で決めた次回以降の種目別設定", () => {
  it.each([1, 4, 6])("追い込み希望でも明示した%dセットを増やさず、初心者の削減も相殺しない", (sets) => {
    const p: MenuPreferences = { ...ruleFor("chest_press", { sets }), intensity: "hard" };
    expect(plan(p).workout.exercises[0].sets).toHaveLength(sets);
    expect(plan({ ...p, experience: "beginner" }).workout.exercises[0].sets).toHaveLength(Math.max(1, sets - 1));
    expect(plan(p, { intake: { ...intake, condition: 2 } }).workout.exercises[0].sets).toHaveLength(Math.max(1, sets - 1));
    expect(plan(p, { intake: { ...intake, soreness: true, soreRegions: ["chest"], soreLevel: "moderate" } }).workout.exercises[0].sets).toHaveLength(Math.max(1, sets - 1));
  });

  it("指定セット・回数・休憩を新しい予定へ反映し、1セットも許可する", () => {
    const w = plan(ruleFor("chest_press", { sets: 4, reps: 6, restSec: 150 })).workout;
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].sets).toHaveLength(4);
    expect(w.exercises[0].restSec).toBe(150);
    expect(w.exercises[0].sets.every((s) => s.reps === 6 && s.plannedReps === 6 && s.weight === undefined)).toBe(true);
    expect(plan(ruleFor("chest_press", { sets: 1 })).workout.exercises[0].sets).toHaveLength(1);
  });

  it("回数指定があれば以前の成功から増量せず、各店舗の実績を独立に使う", () => {
    const history = [record("chest_press", "A", "2026-10-23", 100), record("chest_press", "B", "2026-10-24", 200)];
    const before = JSON.stringify(history);
    const preferences = ruleFor("chest_press", { sets: 4, reps: 5, restSec: 120 });
    const add = (storeId: string, prefs = preferences) => planSingleExercise("chest_press", {
      history, storeId, storeEquipment: [], settings: { preferences: prefs },
    })!;
    expect(workingLoad(add("A", {}))).toBe(105);
    expect(workingLoad(add("A"))).toBe(100);
    expect(workingLoad(add("B"))).toBe(200);
    expect(add("A").previous?.storeId).toBe("A");
    expect(add("A").otherStorePrevious?.storeId).toBe("B");
    expect(add("A").sets.every((s) => s.reps === 5 && s.plannedReps === 5)).toBe(true);
    expect(add("C").weightReference).toBe("other_store");
    expect(workingLoad(add("C"))).toBe(195);
    expect(JSON.stringify(history)).toBe(before);
  });

  it("左右別種目も共通・左右・予定の回数を同じ固定目標にする", () => {
    const h = record("db_curl_single", intake.storeId, "2026-10-24", 10);
    h.exercises[0].sets.forEach((s) => { s.right!.weight = 15; });
    const p = planSingleExercise("db_curl_single", {
      history: [h], storeId: intake.storeId, storeEquipment: [], settings: { preferences: ruleFor("db_curl_single", { reps: 7, sets: 2 }) },
    })!;
    expect(p.sets).toHaveLength(2);
    for (const set of p.sets) {
      expect(set).toMatchObject({ reps: 7, plannedReps: 7, weight: 10, left: { reps: 7, weight: 10 }, right: { reps: 7, weight: 10 } });
    }
  });

  it("長い回数・休憩を採用前に計算し、2セットに削った後へ設定を上書きしない", () => {
    const preferences = ruleFor("chest_press", { sets: 6, reps: 30, restSec: 300 });
    const { workout, summary } = plan(preferences, { intake: { ...intake, timeLimitMin: 30 } });
    expect(workout.exercises[0].sets).toHaveLength(2);
    expect(workout.exercises[0].restSec).toBe(300);
    // 標準12回40秒に対して30回100秒、2セット＋休憩300秒＋移動60秒。
    const minutes = (2 * 100 + 300 + 60) / 60;
    expect(minutes).toBeLessThanOrEqual(computeBudget({ ...intake, timeLimitMin: 30 }, "walk", false).strengthMin + 3);
    expect(summary[0]).toContain(`約${Math.round(minutes)}分`);
  });

  it("時間種目の秒数と左右分を予算・要約に含める", () => {
    const preferences: MenuPreferences = { exerciseRules: [{ exerciseId: "side_plank", sets: 6, seconds: 180, restSec: 300 }] };
    const { workout, summary } = plan(preferences, {
      intake: { ...intake, timeLimitMin: 30 }, storeEquipment: equipmentFor(["side_plank"]),
      settings: { excludedExerciseIds: ["knee_leg_raise"], goals: DEFAULT_GOALS, preferences },
    });
    expect(idsOf(workout)).toEqual(["side_plank"]);
    expect(workout.exercises[0].sets).toHaveLength(2);
    expect(workout.exercises[0].sets.every((s) => s.seconds === 180 && s.reps === undefined)).toBe(true);
    expect(summary[0]).toContain("約18分"); // (2セット×180秒×左右 + 300秒 + 60秒) / 60
  });

  it("最低の2セットでも時間を超える指定は採用しない", () => {
    const preferences = ruleFor("side_plank", { sets: 6, seconds: 180, restSec: 300 });
    const { workout } = plan(preferences, {
      intake: { ...intake, timeLimitMin: 30, cardio: "run" },
      storeEquipment: [...equipmentFor(["side_plank"]),
        { key: "ichijoji:bike", storeId: intake.storeId, equipmentId: "bike", available: true, confirmed: true, updatedAt: "" },
        { key: "ichijoji:treadmill", storeId: intake.storeId, equipmentId: "treadmill", available: true, confirmed: true, updatedAt: "" }],
      settings: { excludedExerciseIds: [], goals: { ...DEFAULT_GOALS, objectives: ["fatloss"] }, preferences: { ...preferences, warmupBike: "yes" } },
    });
    // 30分から準備3分、有酸素8分、移動2分を除く17分に、左右18分は入らない。
    expect(idsOf(workout)).not.toContain("side_plank");
  });

  it("設定のセット数を基準に疲労で減らし、重量も安全側へ調整する", () => {
    const { workout } = plan(ruleFor("chest_press", { sets: 6, reps: 6 }), {
      history: [record("chest_press", intake.storeId, "2026-10-23")],
      intake: { ...intake, soreness: true, soreRegions: ["chest"], soreLevel: "moderate" },
    });
    expect(workout.exercises[0].sets).toHaveLength(5);
    expect(workingLoad(workout.exercises[0])).toBe(80);
    expect(workout.exercises[0].sets[0].weight).toBeLessThan(80);
  });

  it("初心者・軽め・体調・長期復帰のセット削減を設定で打ち消さない", () => {
    const { workout } = plan({ ...ruleFor("chest_press", { sets: 6, reps: 6 }), experience: "new", intensity: "light" }, {
      history: [record("chest_press", intake.storeId, "2026-08-23")], intake: { ...intake, condition: 2 },
    });
    expect(workout.exercises[0].sets).toHaveLength(2);
    expect(workingLoad(workout.exercises[0])).toBeLessThan(100);
  });

  it.each(["pain", "excluded", "equipment", "severe", "disliked", "deleted"] as const)("設定・順番があっても %s の除外を優先する", (reason) => {
    const preferences: MenuPreferences = { ...ruleFor("chest_press", { sets: 6, reps: 6 }), exerciseOrder: ["chest_press"] };
    if (reason === "deleted") setDeletedExercises(["chest_press"]);
    const { workout } = plan(preferences, {
      intake: { ...intake, ...(reason === "pain" ? { pain: { present: true, description: "肩に痛み" } } : {}),
        ...(reason === "severe" ? { soreness: true, soreRegions: ["chest"], soreLevel: "severe" } : {}) },
      settings: { excludedExerciseIds: reason === "excluded" ? ["chest_press"] : [],
        preferences: { ...preferences, dislikedExerciseIds: reason === "disliked" ? ["chest_press"] : [] } },
      storeEquipment: equipmentFor(["chest_press"]).map((r) => ({ ...r, available: reason !== "equipment" })),
    });
    expect(idsOf(workout)).not.toContain("chest_press");
  });

  it("将来候補の種目を設定だけで利用実績なしに追加しない", () => {
    expect(getExercise("calf_raise")!.optional).toBe(true);
    expect(idsOf(plan(ruleFor("calf_raise", { sets: 3 }), { storeEquipment: equipmentFor(["calf_raise"]) }).workout)).not.toContain("calf_raise");
  });

  it("指定した採用種目を先に並べ、残りの相対順と有酸素の位置を保つ", () => {
    const equipment = equipmentFor(["leg_press", "leg_curl", "chest_press", "lat_pulldown", "seated_row"]);
    equipment.push(...["bike", "treadmill"].map((equipmentId) => ({
      key: `ichijoji:${equipmentId}`, storeId: intake.storeId, equipmentId, available: true, confirmed: true, updatedAt: "",
    })));
    const base = { intake: { ...intake, cardio: "walk" as const }, storeEquipment: equipment };
    const initial = plan({}, base).workout;
    const preferred = ["seated_row", "chest_press"];
    const ordered = plan({ exerciseOrder: ["missing", ...preferred] }, base).workout;
    expect(idsOf(ordered).slice(0, 2)).toEqual(preferred);
    expect(idsOf(ordered).slice(2)).toEqual(idsOf(initial).filter((id) => !preferred.includes(id)));
    expect(orderedItems(ordered)[0].kind).toBe("cardio");
    expect(ordered.cardio.find((c) => c.id === orderedItems(ordered).at(-1)!.id)?.machine).toBe("treadmill");
  });

  it("自動追加は設定を使い、手動追加では本人が指定する回数を優先する", () => {
    const input = { history: [], storeId: intake.storeId, storeEquipment: [], settings: { preferences: ruleFor("chest_press", { sets: 1, reps: 5, restSec: 150 }) } };
    const auto = planSingleExercise("chest_press", input)!;
    const manual = planSingleExercise("chest_press", { ...input, manual: true })!;
    expect(auto.sets).toHaveLength(1);
    expect(auto.sets[0]).toMatchObject({ reps: 5, plannedReps: 5 });
    expect(manual.sets).toHaveLength(getExercise("chest_press")!.defaultSets);
    expect(manual.sets.every((s) => s.reps === getExercise("chest_press")!.defaultReps && s.plannedReps === undefined)).toBe(true);
    expect(manual.restSec).toBe(getExercise("chest_press")!.restSec);
  });

  it("相談設定での自動追加でも初心者・軽めのセット削減を優先する", () => {
    const input = { history: [], storeId: intake.storeId, storeEquipment: [], settings: {
      preferences: { ...ruleFor("chest_press", { sets: 6 }), experience: "new" as const, intensity: "light" as const },
    } };
    expect(planSingleExercise("chest_press", input)!.sets).toHaveLength(4);
    expect(planSingleExercise("chest_press", { ...input, settings: { preferences: { experience: "new", intensity: "light" } } })!.sets).toHaveLength(3);
  });

  it("空の設定・standardは未設定と同じ予定を作り、過去の記録・設定を変更しない", () => {
    const history = [record("chest_press", intake.storeId, "2026-10-23")];
    const preferences: MenuPreferences = { exerciseRules: [], exerciseOrder: [], progressionMode: "standard" };
    const before = JSON.stringify({ history, preferences });
    const shape = (w: Workout) => w.exercises.map(({ id: _id, sets, ...e }) => (void _id, {
      ...e, sets: sets.map(({ id: _setId, ...s }) => (void _setId, s)),
    }));
    expect(shape(plan(preferences, { history }).workout)).toEqual(shape(plan({}, { history }).workout));
    expect(JSON.stringify({ history, preferences })).toBe(before);
  });
});

describe("中長期の重量・回数の進め方", () => {
  const success = (weight: number, reps: number): PastSession => ({ weight, reps, outcome: { allDone: true, success: true, missed: false, unreported: false } });
  const missed = (weight: number, reps: number): PastSession => ({ weight, reps, outcome: { allDone: true, success: false, missed: true, unreported: false } });

  it("cautiousは最低2回の連続成功と回数からの進行を使い、既存の厳しい条件を緩めない", () => {
    const def = getExercise("chest_press")!;
    for (const prefs of [{}, { experience: "advanced", age: 62, intensity: "light" }] as MenuPreferences[]) {
      const standard = progressionProfile(def, prefs);
      const cautious = progressionProfile(def, { ...prefs, progressionMode: "cautious" });
      expect(cautious.requiredSuccesses).toBe(Math.max(2, standard.requiredSuccesses));
      expect(cautious.doubleProgression).toBe(true);
      expect(cautious.maxJump).toBe(standard.maxJump);
      expect(cautious.deloadAfter).toBe(standard.deloadAfter);
    }
    const cautious = progressionProfile(def, { progressionMode: "cautious" });
    expect(decideNextLoad(def, [success(100, 10)], 5, cautious)).toMatchObject({ kind: "hold", weight: 100, reps: 10 });
    expect(decideNextLoad(def, [success(100, 10), success(100, 10)], 5, cautious)).toMatchObject({ kind: "increase_reps", weight: 100, reps: 11 });
  });

  it("holdは重量・回数を上げず、未報告・未完了・連続未達成の判断も保持する", () => {
    const def = getExercise("chest_press")!;
    const hold = progressionProfile(def, { progressionMode: "hold" });
    expect(decideNextLoad(def, [success(100, 5)], 5, hold)).toMatchObject({ kind: "hold", weight: 100, reps: 5 });
    const partial = success(100, 5);
    partial.outcome = { allDone: false, success: false, missed: false, unreported: false };
    expect(decideNextLoad(def, [partial], 5, hold)).toMatchObject({ kind: "hold", weight: 100, reps: 5 });
    const unreported = success(100, 5);
    unreported.outcome = { allDone: true, success: false, missed: false, unreported: true };
    expect(decideNextLoad(def, [unreported], 5, hold)).toMatchObject({ kind: "hold", weight: 100, reps: 5 });
    expect(decideNextLoad(def, [missed(100, 5), missed(100, 5)], 5, hold)).toMatchObject({ kind: "deload", weight: 90, reps: 5 });
  });

  it("補助種目のholdは補助を減らさず、未達成時は補助を増やす", () => {
    const def = getExercise("assisted_chin")!;
    const hold = progressionProfile(def, { progressionMode: "hold" });
    expect(decideNextLoad(def, [success(30, 8)], 5, hold)).toMatchObject({ kind: "hold", weight: 30, reps: 8 });
    expect(decideNextLoad(def, [missed(30, 8), missed(30, 8)], 5, hold).weight).toBeGreaterThan(30);
  });

  it("固定回数でも連続未達成による軽減は止めない", () => {
    const history = [record("chest_press", intake.storeId, "2026-10-23", 100, 12, false), record("chest_press", intake.storeId, "2026-10-24", 100, 12, false)];
    const ex = plan(ruleFor("chest_press", { reps: 6 }), { history }).workout.exercises[0];
    expect(workingLoad(ex)).toBe(90);
    expect(ex.sets.every((s) => s.reps === 6 && s.plannedReps === 6)).toBe(true);
  });

  it("cautiousの連続成功へ他店舗の成功を混ぜない", () => {
    const a = record("chest_press", "A", "2026-10-23");
    const b = record("chest_press", "B", "2026-10-24");
    const add = (history: Workout[]) => planSingleExercise("chest_press", {
      history, storeId: "A", storeEquipment: [], settings: { preferences: { progressionMode: "cautious" } },
    })!;
    expect(workingLoad(add([a, b]))).toBe(100);
    expect(workingLoad(add([a, b, record("chest_press", "A", "2026-10-22")]))).toBe(105);
  });

  it("自重の回数もholdで増やさず、cautiousはこの店舗の連続成功を待つ", () => {
    const a = record("knee_leg_raise", "A", "2026-10-23", 0, 12);
    const b = record("knee_leg_raise", "B", "2026-10-24", 0, 12);
    const reps = (mode: MenuPreferences["progressionMode"], history = [a, b]) => planSingleExercise("knee_leg_raise", {
      history, storeId: "A", storeEquipment: [], settings: { preferences: { progressionMode: mode } },
    })!.sets[0].reps;
    expect(reps("standard")).toBe(13);
    expect(reps("hold")).toBe(12);
    expect(reps("cautious")).toBe(12);
    expect(reps("cautious", [a, b, record("knee_leg_raise", "A", "2026-10-22", 0, 12)])).toBe(13);
  });
});
