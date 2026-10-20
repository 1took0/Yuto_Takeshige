import { describe, expect, it } from "vitest";
import type { IntakeAnswers } from "@/lib/types";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { generatePlan, planSingleExercise } from "./index";

const equipment = defaultStoreEquipment();
const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: null, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };
const now = new Date("2026-10-18T10:00:00+09:00");

describe("ヒアリングで答えた「これまでに行っていた種目」", () => {
  const preferences = { pastExercises: [{ exerciseId: "bb_bench_press", weight: 60, reps: 8 }, { exerciseId: "db_goblet_squat" }] };

  it("自動作成の枠に無い種目でもメニューに入り、同じ枠ではほかの種目より選ばれやすい", () => {
    const { workout } = generatePlan({ intake, history: [], storeEquipment: equipment, settings: { excludedExerciseIds: [], preferences }, now });
    const ids = workout.exercises.map((e) => e.exerciseId);
    expect(ids).toContain("bb_bench_press");
    expect(ids).toContain("db_goblet_squat");
    expect(ids).not.toContain("leg_press");
    expect(workout.exercises.find((e) => e.exerciseId === "db_goblet_squat")!.rationale ?? "").toContain("以前行っていた種目です");
  });

  it("アプリの記録が無いときは、以前の重量を参考に少し軽め（約9割）から始める", () => {
    const ex = planSingleExercise("bb_bench_press", { history: [], storeId: "ichijoji", storeEquipment: equipment, settings: { preferences } })!;
    const w = ex.sets[0].weight!;
    expect(w).toBeLessThan(60);
    expect(w).toBeGreaterThanOrEqual(50);
    expect(ex.sets[0].reps).toBe(8);
    expect(ex.rationale ?? "").toContain("以前行っていた重量（60kg×8回）");
  });

  it("答えていなければ従来どおり", () => {
    const ex = planSingleExercise("bb_bench_press", { history: [], storeId: "ichijoji", storeEquipment: equipment, settings: {} })!;
    expect(ex.rationale ?? "").not.toContain("以前行っていた");
  });
});
