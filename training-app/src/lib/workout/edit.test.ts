import { describe, expect, it } from "vitest";
import { addExercise, addSet, finalizeWorkout, progressOf, removeSet, setExcluded, toggleSetCompleted, updateSet } from "./edit";
import type { Workout } from "@/lib/types";

function base(): Workout {
  const now = "2026-10-18T01:00:00.000Z";
  return {
    id: "w1",
    trainingDate: "2026-10-18",
    startedAt: now,
    storeId: "ichijoji",
    exercises: [],
    cardio: [],
    status: "active",
    source: "app",
    createdAt: now,
    updatedAt: now,
  };
}

describe("workout edit", () => {
  it("セット追加は直前のセットの重量を初期値にし、変更できる", () => {
    let w = addExercise(base(), "leg_press", { sets: 2, weight: 50, rampFirst: true });
    const ex = w.exercises[0];
    expect(ex.sets.map((s) => s.weight)).toEqual([45, 50]);
    w = addSet(w, ex.id);
    expect(w.exercises[0].sets).toHaveLength(3);
    expect(w.exercises[0].sets[2].weight).toBe(50);
    expect(w.exercises[0].sets[2].completed).toBe(false);
    const sid = w.exercises[0].sets[2].id;
    w = updateSet(w, ex.id, sid, { weight: 55 });
    expect(w.exercises[0].sets[2].weight).toBe(55);
  });

  it("完了チェック・除外・削除と進捗", () => {
    let w = addExercise(base(), "chest_press", { sets: 3, weight: 35 });
    const ex = w.exercises[0];
    expect(progressOf(w)).toMatchObject({ doneSets: 0, plannedSets: 3, doneExercises: 0, totalExercises: 1, remainingExercises: 1 });
    w = toggleSetCompleted(w, ex.id, ex.sets[0].id);
    expect(progressOf(w).doneSets).toBe(1);
    w = setExcluded(w, ex.id, ex.sets[2].id, true);
    expect(progressOf(w).plannedSets).toBe(2);
    w = removeSet(w, ex.id, ex.sets[1].id);
    expect(w.exercises[0].sets).toHaveLength(2);
    expect(progressOf(w)).toMatchObject({ doneSets: 1, plannedSets: 1, doneExercises: 1 });
    expect(progressOf(w).estRemainingSec).toBe(0);
  });

  it("片手種目は左右別の重量・回数を持つ", () => {
    let w = addExercise(base(), "db_hammer_curl_single", { sets: 2, weight: 5 });
    const ex = w.exercises[0];
    expect(ex.sets[0].left).toEqual({ weight: 5, reps: 12 });
    w = updateSet(w, ex.id, ex.sets[0].id, { right: { weight: 6, reps: 12, actualReps: 10 } });
    expect(w.exercises[0].sets[0].right?.actualReps).toBe(10);
    expect(w.exercises[0].sets[0].left?.weight).toBe(5);
  });

  it("終了時に未完了セットは除外され、実績は推測されない", () => {
    let w = addExercise(base(), "lat_pulldown", { sets: 3, weight: 35 });
    const ex = w.exercises[0];
    w = toggleSetCompleted(w, ex.id, ex.sets[0].id);
    const done = finalizeWorkout(w, "2026-10-18T02:00:00.000Z");
    expect(done.status).toBe("completed");
    expect(done.exercises[0].sets.map((s) => s.excluded)).toEqual([false, true, true]);
    expect(done.exercises[0].sets[0].actualReps).toBeUndefined();
    expect(done.exercises[0].status).toBe("done");
  });

  it("推定残り時間は未完了セット分 + 有酸素", () => {
    const w = addExercise(base(), "leg_press", { sets: 3, weight: 50 });
    const p = progressOf(w);
    // 3セット×45秒 + 2×90秒休憩 + 45秒準備
    expect(p.estRemainingSec).toBe(3 * 45 + 2 * 90 + 45);
  });
});
