import { describe, expect, it } from "vitest";
import type { IntakeAnswers, Workout } from "@/lib/types";
import { addExercise, finalizeWorkout, newManualWorkout, toggleSetCompleted, updateSet } from "@/lib/workout/edit";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { generatePlan, planSingleExercise } from "./index";
import { isManualWorkout, manualHabits } from "./habits";
import { sessionOutcome } from "./history";

const equipment = defaultStoreEquipment();
const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: null, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };

/** 自分で入力したメニューを作り、全セット完了して保存した状態にする */
function manualSession(date: string, items: { id: string; weight?: number; reps?: number }[]): Workout {
  let w = newManualWorkout("ichijoji", "LifeFit 一乗寺店", new Date(`${date}T19:00:00+09:00`));
  for (const it of items) w = addExercise(w, it.id, { sets: 3, weight: it.weight });
  for (const e of w.exercises) {
    for (const s of e.sets) {
      const it = items.find((x) => x.id === e.exerciseId)!;
      if (it.reps) w = updateSet(w, e.id, s.id, { reps: it.reps });
      w = toggleSetCompleted(w, e.id, s.id);
    }
  }
  return finalizeWorkout(w, `${date}T20:00:00+09:00`);
}

describe("自分で入力したメニュー", () => {
  const items = [
    { id: "face_pull", weight: 15, reps: 15 },
    { id: "chest_press", weight: 40, reps: 8 },
    { id: "leg_press", weight: 80, reps: 10 },
  ];
  const history = [manualSession("2026-10-10", items), manualSession("2026-10-13", items), manualSession("2026-10-16", items)];

  it("自分で決めた回数が目標になる（回数を変えても「届かなかった」扱いにしない）", () => {
    const e = history[0].exercises.find((x) => x.exerciseId === "chest_press")!;
    expect(e.sets[0].plannedReps).toBeUndefined();
    expect(sessionOutcome(e).success).toBe(true);
    expect(isManualWorkout(history[0])).toBe(true);
  });

  it("よく行う種目と、並び順を読み取る", () => {
    const h = manualHabits(history, "2026-10-18");
    expect(h.count).toBe(3);
    expect(h.freq.get("face_pull")).toBe(1);
    expect(h.position.get("face_pull")).toBe(0);
    expect(h.position.get("leg_press")).toBe(1);
  });

  it("自動作成でも、自分のメニューの種目（自動作成の枠に無い種目も）を選び、同じ順番に並べる", () => {
    const { workout, summary } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now: new Date("2026-10-18T10:00:00+09:00") });
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).toContain("face_pull");
    expect(ids.indexOf("face_pull")).toBeLessThan(ids.indexOf("chest_press"));
    expect(ids.indexOf("chest_press")).toBeLessThan(ids.indexOf("leg_press"));
    expect(summary.some((s) => s.includes("これまでの記録"))).toBe(true);
  });

  it("重量と回数は自分のメニューの記録から進める（全セット達成なので前に進む）", () => {
    const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now: new Date("2026-10-18T10:00:00+09:00") });
    const cp = workout.exercises.find((e) => e.exerciseId === "chest_press")!;
    const last = cp.sets.at(-1)!;
    expect(last.weight! * (1 + last.reps! / 30)).toBeGreaterThan(40 * (1 + 8 / 30));
  });

  it("トレーニング中に自分で種目を追加すると、前回の記録から重量・回数が入る", () => {
    const ex = planSingleExercise("chest_press", { history, storeId: "ichijoji", storeEquipment: equipment, settings: {}, manual: true })!;
    expect(ex.sets.at(-1)!.weight).toBeGreaterThanOrEqual(40);
    expect(ex.previous?.trainingDate).toBe("2026-10-16");
    // 自分で入力するメニューでは、決めた回数が目標
    expect(ex.sets.every((s) => s.plannedReps === undefined)).toBe(true);
    // 記録が無い種目は空欄
    expect(planSingleExercise("pec_fly", { history, storeId: "ichijoji", storeEquipment: equipment, settings: {} })!.sets[0].weight).toBeUndefined();
  });
});
