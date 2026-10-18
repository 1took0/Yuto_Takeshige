import { describe, expect, it } from "vitest";
import { categoryOf, computeDurations, formatDurations } from "./duration";
import { addExercise, finalizeWorkout, toggleSetCompleted } from "./edit";
import { buildSeedWorkouts } from "@/lib/seed/history";
import type { Workout } from "@/lib/types";

function base(): Workout {
  return { id: "w", trainingDate: "2026-10-18", startedAt: "2026-10-18T01:00:00.000Z", storeId: "ichijoji", exercises: [], cardio: [], status: "active", source: "app", createdAt: "", updatedAt: "" };
}

describe("トレーニング時間", () => {
  it("器具で分類する", () => {
    expect(categoryOf({ exerciseId: "leg_press" })).toBe("machine");
    expect(categoryOf({ exerciseId: "db_bench_press" })).toBe("dumbbell");
    expect(categoryOf({ exerciseId: "db_hammer_curl_single" })).toBe("dumbbell");
    expect(categoryOf({ exerciseId: "plank" })).toBe("bodyweight");
  });

  it("完了時刻の間隔から種目の時間を計算し、合計は開始〜終了", () => {
    let w = addExercise(base(), "db_bench_press", { sets: 3, weight: 12 });
    w = addExercise(w, "leg_press", { sets: 2, weight: 50 });
    const db = w.exercises[0];
    const lp = w.exercises[1];
    // 完了時刻を固定で与える（ダンベル：0分, 3分, 6分 → 6分 + 動作45秒 ≒ 7分）
    w = { ...w, exercises: [
      { ...db, sets: db.sets.map((s, i) => ({ ...s, completed: true, completedAt: new Date(Date.parse("2026-10-18T01:05:00Z") + i * 180_000).toISOString() })) },
      { ...lp, sets: lp.sets.map((s, i) => ({ ...s, completed: true, completedAt: new Date(Date.parse("2026-10-18T01:20:00Z") + i * 120_000).toISOString() })) },
    ] };
    const done = finalizeWorkout(w, "2026-10-18T01:45:00.000Z");
    expect(done.durations).toMatchObject({ totalMin: 45, dumbbellMin: 7, machineMin: 3, bodyweightMin: 0, cardioMin: 0 });
    expect(formatDurations(done.durations)).toBe("合計45分（マシン3・ダンベル7）");
  });

  it("完了チェックで時刻が入り、外すと消える", () => {
    let w = addExercise(base(), "db_row", { sets: 2, weight: 10 });
    const e = w.exercises[0];
    w = toggleSetCompleted(w, e.id, e.sets[0].id);
    expect(w.exercises[0].sets[0].completedAt).toBeTruthy();
    w = toggleSetCompleted(w, e.id, e.sets[0].id);
    expect(w.exercises[0].sets[0].completedAt).toBeUndefined();
  });

  it("手で修正した時間は終了時に上書きしない", () => {
    let w = addExercise(base(), "db_row", { sets: 1, weight: 10 });
    w = toggleSetCompleted(w, w.exercises[0].id, w.exercises[0].sets[0].id);
    const done = finalizeWorkout({ ...w, durations: { totalMin: 30, dumbbellMin: 30, manual: true } });
    expect(done.durations).toEqual({ totalMin: 30, dumbbellMin: 30, manual: true });
  });

  it("時刻のない過去の取り込み記録は推測しない", () => {
    expect(computeDurations(buildSeedWorkouts()[0])).toBeUndefined();
  });
});
