import { describe, expect, it } from "vitest";
import type { Workout } from "@/lib/types";
import { addCardio, addExercise, moveItemTo, newManualWorkout, orderedItems } from "./edit";

function base(): Workout {
  let w = newManualWorkout("ichijoji", "LifeFit 一乗寺店", new Date("2026-10-19T10:00:00+09:00"));
  w = addExercise(addExercise(w, "leg_press"), "chest_press");
  w = addCardio(w, "treadmill");
  // ウォームアップのバイクを先頭に
  return { ...w, cardio: [{ ...addCardio(w, "bike").cardio[1], role: "warmup" }, ...w.cardio] };
}
const kinds = (w: Workout) => orderedItems(w).map((it) => (it.kind === "exercise" ? w.exercises.find((e) => e.id === it.id)!.exerciseId : w.cardio.find((c) => c.id === it.id)!.machine));

describe("種目と有酸素をまとめた並び順", () => {
  it("並べ替えていなければ ウォームアップ → 種目 → 有酸素", () => {
    expect(kinds(base())).toEqual(["bike", "leg_press", "chest_press", "treadmill"]);
  });

  it("有酸素を種目の間や先頭へ動かせ、種目の番号順は保たれる", () => {
    let w = base();
    const tm = w.cardio.find((c) => c.machine === "treadmill")!.id;
    w = moveItemTo(w, tm, 1);
    expect(kinds(w)).toEqual(["bike", "treadmill", "leg_press", "chest_press"]);
    const bike = w.cardio.find((c) => c.machine === "bike")!.id;
    w = moveItemTo(w, bike, 3);
    expect(kinds(w)).toEqual(["treadmill", "leg_press", "chest_press", "bike"]);
    // 種目を有酸素より前へ動かすと、種目の並び（番号）も変わる
    const chest = w.exercises.find((e) => e.exerciseId === "chest_press")!.id;
    w = moveItemTo(w, chest, 0);
    expect(kinds(w)).toEqual(["chest_press", "treadmill", "leg_press", "bike"]);
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(["chest_press", "leg_press"]);
  });

  it("後から追加した種目は最後の種目の後ろ、有酸素は末尾に入る", () => {
    let w = base();
    w = moveItemTo(w, w.cardio.find((c) => c.machine === "treadmill")!.id, 0);
    w = addExercise(w, "lat_pulldown");
    w = addCardio(w, "bike");
    expect(kinds(w)).toEqual(["treadmill", "bike", "leg_press", "chest_press", "lat_pulldown", "bike"]);
  });
});
