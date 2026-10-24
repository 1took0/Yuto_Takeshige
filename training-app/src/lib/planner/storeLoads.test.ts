import { describe, expect, it } from "vitest";
import { buildPlannedExercise, planSingleExercise } from "./index";
import { workingWeight } from "./history";
import { buildExercise, updateSet, toggleSetCompleted, finalizeWorkout } from "@/lib/workout/edit";
import { getExercise } from "@/lib/catalog/exercises";
import { TrainingDB, setDb } from "@/lib/db";
import { listCompletedWorkouts, saveWorkout } from "@/lib/db/repo";
import type { StoreEquipment, Workout } from "@/lib/types";

function record(storeId: string, date: string, weight?: number, reported = false, exerciseId = "chest_press"): Workout {
  const exercise = buildExercise(getExercise(exerciseId)!, { weight, reps: 12, sets: 2, recordPlan: true });
  exercise.sets = exercise.sets.map((s) => ({ ...s, completed: true, actualReps: reported ? 12 : undefined }));
  return { id: `${storeId}-${date}`, storeId, storeLabel: `テスト${storeId}`, trainingDate: date, startedAt: `${date}T10:00:00Z`,
    createdAt: date, updatedAt: date, status: "completed", source: "app", exercises: [exercise], cardio: [] };
}
const plan = (history: Workout[], storeId: string, exerciseId = "chest_press", storeEquipment: StoreEquipment[] = []) =>
  planSingleExercise(exerciseId, { history, storeId, storeEquipment, settings: {} })!;
const lastWeight = (e: ReturnType<typeof plan>) => e.sets.at(-1)?.weight;

describe("店舗ごとの重量の基準", () => {
  it("店舗の低重量を疲労調整の丸めで増やさず、アシストは補助を増やす", () => {
    for (const [id, weight] of [["chest_press", 2], ["assisted_chin", 30], ["db_curl_single", 10]] as const) {
      const def = getExercise(id)!;
      const p = buildPlannedExercise({ def, slot: { key: "test", candidates: [id], regions: [], base: 0 }, score: 0,
        confirmed: true, loadFactor: 0.8, setsDelta: 0, notes: [] }, [record("A", "2026-10-01", weight, false, id)], "A", { level: "moderate", regions: new Set() });
      expect(p.sets.every((s) => id === "assisted_chin" ? s.weight! >= weight : s.weight! <= weight)).toBe(true);
      if (id === "db_curl_single") {
        expect(p.sets[0].left?.weight).toBe(p.sets[0].weight);
        expect(p.sets[0].right?.weight).toBe(p.sets[0].weight);
        expect(p.sets[0].weight).toBeLessThan(p.sets.at(-1)!.weight!);
      }
    }
  });
  it("新しい他店舗の重量で上書きせず、各店舗の重量と参考記録を分ける", () => {
    const history = [record("A", "2026-10-01", 50), record("B", "2026-10-20", 100)];
    const before = JSON.stringify(history);
    expect(lastWeight(plan(history, "A"))).toBe(50);
    expect(lastWeight(plan(history, "B"))).toBe(100);
    expect(plan(history, "A").previous?.storeId).toBe("A");
    expect(plan(history, "A").otherStorePrevious?.storeId).toBe("B");
    expect(plan(history, "A").weightReference).toBe("same_store");
    expect(JSON.stringify(history)).toBe(before);
  });

  it("他店舗の成功・未達成を同店舗の連続達成判定に混ぜない", () => {
    const a = record("A", "2026-10-01", 100, true);
    const b = record("B", "2026-10-20", 200, true);
    const local = planSingleExercise("chest_press", { history: [a, b], storeId: "A", storeEquipment: [], settings: { preferences: { experience: "advanced" } } })!;
    expect(lastWeight(local)).toBe(100); // 上級者の連続2回には届いていない。
    expect(lastWeight(plan([a, b], "A"))).toBe(105); // 通常は同店舗の1回の達成で進める。
  });

  it("同店舗の最新重量が未入力でも過去の有効な重量を据え置きで参照する", () => {
    const h = [record("A", "2026-10-01", 50, true), record("A", "2026-10-20"), record("B", "2026-10-22", 100)];
    const p = plan(h, "A");
    expect(lastWeight(p)).toBe(50);
    expect(p.previous?.trainingDate).toBe("2026-10-01");
    expect(p.rationale).toContain("重量未入力");
  });

  it("同店舗に有効な重量がなければ他店舗の有効記録から仮の目安を出す", () => {
    const h = [record("B", "2026-10-01", 50), record("B", "2026-10-20"), record("A", "2026-10-22")];
    const p = plan(h, "A");
    expect(lastWeight(p)).toBe(45);
    expect(p.weightReference).toBe("other_store");
    expect(p.previous?.trainingDate).toBe("2026-10-01");
    expect(p.rationale).toContain("仮の重量");
    expect(lastWeight(plan([record("B", "2026-10-01", 2)], "A"))).toBe(2);
    expect(lastWeight(plan([record("B", "2026-10-01", 0)], "A"))).toBe(0);
    expect(lastWeight(plan([record("B", "2026-10-01", 30, false, "assisted_chin")], "A", "assisted_chin"))).toBe(35);
  });

  it("調整した重量を保存して店舗を往復しても、各店舗の基準を保持する", async () => {
    const db = new TrainingDB(`store-load-${crypto.randomUUID()}`);
    setDb(db);
    try {
      const a = record("A", "2026-10-01", 50);
      await saveWorkout(a);
      const savedA = (await listCompletedWorkouts()).find((w) => w.id === a.id);
      const bPlan = plan(await listCompletedWorkouts(), "B");
      let b: Workout = { ...record("B", "2026-10-22"), status: "active", exercises: [bPlan] };
      for (const s of bPlan.sets) {
        b = updateSet(b, bPlan.id, s.id, { weight: 30, reps: 8 });
        b = toggleSetCompleted(b, bPlan.id, s.id);
      }
      await saveWorkout(finalizeWorkout(b));
      const saved = await listCompletedWorkouts();
      expect(lastWeight(plan(saved, "B"))).toBe(30);
      expect(plan(saved, "B").weightReference).toBe("same_store");
      expect(lastWeight(plan(saved, "A"))).toBe(50);
      expect(saved.find((w) => w.id === a.id)).toEqual(savedA);
    } finally { await db.delete(); setDb(null); }
  });

  it("未完了・除外の予定重量を使わず、実績と刻みが合わなくても勝手に丸めない", () => {
    const a = record("A", "2026-10-01", 32.5, true);
    a.exercises[0].sets.push({ id: "excluded", weight: 999, reps: 12, completed: true, excluded: true },
      { id: "planned", weight: 200, reps: 12, completed: false, excluded: false });
    expect(lastWeight(plan([a], "A"))).toBe(32.5);
    expect(plan([a], "A").rationale).toContain("刻みを確認");
    expect(lastWeight(plan([record("A", "2026-10-01", 0)], "A"))).toBe(0);
    const misses = [record("A", "2026-10-01", 0, true), record("A", "2026-10-02", 0, true)];
    misses.forEach((w) => w.exercises[0].sets.forEach((s) => { s.actualReps = 5; }));
    expect(lastWeight(plan(misses, "A"))).toBe(0);
    const eq: StoreEquipment[] = [{ key: "A:chest_press", storeId: "A", equipmentId: getExercise("chest_press")!.equipmentId, available: true, confirmed: true, stepKg: 2.5, updatedAt: "now" }];
    expect(lastWeight(plan([record("A", "2026-10-01", 100, true)], "A", "chest_press", eq))).toBe(102.5);
    expect(lastWeight(plan([record("B", "2026-10-01", 100, true)], "B", "chest_press", eq))).toBe(105);
  });

  it("左右別に調整した重量を優先し、片側やセットの重量未入力では進めない", () => {
    const a = record("A", "2026-10-01", 100, true, "db_curl_single");
    a.exercises[0].sets.forEach((s) => { s.left = { weight: 10, reps: 12, actualReps: 12 }; s.right = { weight: 15, reps: 12 }; });
    expect(workingWeight(a.exercises[0])).toBe(10);
    expect(lastWeight(plan([a], "A", "db_curl_single"))).toBe(10);
    expect(plan([a], "A", "db_curl_single").sets.at(-1)?.reps).toBe(12);
    a.exercises[0].sets.at(-1)!.left!.weight = undefined;
    expect(lastWeight(plan([a], "A", "db_curl_single"))).toBe(10);
    a.exercises[0].sets[0].left!.weight = NaN;
    expect(workingWeight(a.exercises[0])).toBeUndefined();
  });
});
