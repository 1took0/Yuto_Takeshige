import { describe, expect, it } from "vitest";
import type { IntakeAnswers, Workout } from "@/lib/types";
import { addCardio, addExercise, finalizeWorkout, newManualWorkout, toggleSetCompleted } from "@/lib/workout/edit";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { generatePlan } from "./index";
import { cardioHabits, skipsCardio } from "./habits";

const equipment = defaultStoreEquipment();
const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };
const now = new Date("2026-10-18T10:00:00+09:00");

/** 自分で入力したメニュー（チェストプレスを全セット完了）。bike: true ならバイクも完了にする */
function session(date: string, bike = false): Workout {
  let w = newManualWorkout("ichijoji", "LifeFit 一乗寺店", new Date(`${date}T19:00:00+09:00`));
  w = addExercise(w, "chest_press", { sets: 2, weight: 40 });
  for (const s of w.exercises[0].sets) w = toggleSetCompleted(w, w.exercises[0].id, s.id);
  if (bike) {
    w = addCardio(w, "bike");
    w = { ...w, cardio: w.cardio.map((c) => ({ ...c, completed: true })) };
  }
  return finalizeWorkout(w, `${date}T20:00:00+09:00`);
}

describe("記録に無いバイク・トレッドミルは無理に入れない", () => {
  it("記録が2回以上あってバイクを一度も行っていなければ、ウォームアップのバイクを入れない", () => {
    const history = [session("2026-10-13"), session("2026-10-16")];
    expect(skipsCardio(cardioHabits(history, "2026-10-18"), "bike")).toBe(true);
    expect(skipsCardio(cardioHabits(history, "2026-10-18"), "treadmill")).toBe(true);
    const { workout, summary } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(workout.cardio.some((c) => c.machine === "bike")).toBe(false);
    expect(summary.some((s) => s.includes("バイクが無いため"))).toBe(true);
  });

  it("バイクを行った記録があれば、これまでどおり入れる", () => {
    const history = [session("2026-10-13", true), session("2026-10-16")];
    const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(workout.cardio.some((c) => c.machine === "bike")).toBe(true);
  });

  it("記録が少ない（1回以下）うちは判断しない", () => {
    const history = [session("2026-10-16")];
    expect(skipsCardio(cardioHabits(history, "2026-10-18"), "bike")).toBe(false);
    const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(workout.cardio.some((c) => c.machine === "bike")).toBe(true);
  });

  it("トレッドミルは、その日に有酸素を選べば記録に無くても入る", () => {
    const history = [session("2026-10-13"), session("2026-10-16")];
    const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(workout.cardio.some((c) => c.machine === "treadmill")).toBe(true);
    const none = generatePlan({ intake: { ...intake, cardio: "none" }, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(none.workout.cardio).toHaveLength(0);
  });
});

describe("セット数は本人の記録に合わせる", () => {
  it("直近3回の中央値を使い、記録が無ければ標準値", async () => {
    const { learnedSets } = await import("./history");
    const mk = (date: string, n: number) => {
      let w = newManualWorkout("ichijoji", "LifeFit 一乗寺店", new Date(`${date}T19:00:00+09:00`));
      w = addExercise(w, "chest_press", { sets: n, weight: 40 });
      for (const s of w.exercises[0].sets) w = toggleSetCompleted(w, w.exercises[0].id, s.id);
      return finalizeWorkout(w, `${date}T20:00:00+09:00`);
    };
    const history = [mk("2026-10-10", 4), mk("2026-10-13", 4), mk("2026-10-16", 2)];
    expect(learnedSets(history, "chest_press")).toBe(4);
    expect(learnedSets(history, "leg_press")).toBeUndefined();
    const { workout } = generatePlan({ intake: { ...intake, timeLimitMin: null }, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(workout.exercises.find((e) => e.exerciseId === "chest_press")!.sets).toHaveLength(4);
  });
});
