import { beforeEach, describe, expect, it } from "vitest";
import { TrainingDB, setDb } from "./index";
import { countImportedSeed, ensureSeeded, importSeedHistory, listCompletedWorkouts, listStoreEquipment, saveWorkout, deleteWorkout, setWorkoutChangeListener } from "./repo";
import { buildSeedWorkouts } from "@/lib/seed/history";

let n = 0;
beforeEach(() => {
  setDb(new TrainingDB(`test-${++n}`));
  setWorkoutChangeListener(null);
});

describe("repo", () => {
  it("起動時は器具だけ投入し、履歴は取り込まない", async () => {
    await ensureSeeded();
    expect((await listStoreEquipment()).length).toBeGreaterThan(10);
    expect(await listCompletedWorkouts()).toHaveLength(0);
  });
  it("本人が選んだときだけ作成者の履歴を取り込む（重複しない）", async () => {
    expect(await importSeedHistory()).toBe(12);
    expect(await importSeedHistory()).toBe(0);
    expect(await countImportedSeed()).toBe(12);
  });
  it("完了済み記録の保存・削除で変更通知が出る（進行中は通知しない）", async () => {
    const events: string[] = [];
    setWorkoutChangeListener((c) => events.push(c.type === "upsert" ? `up:${c.workout.id}` : c.type === "delete" ? `del:${c.id}` : "bulk"));
    const w = buildSeedWorkouts()[0];
    await saveWorkout({ ...w, status: "active" });
    await saveWorkout(w);
    await deleteWorkout(w.id);
    expect(events).toEqual([`up:${w.id}`, `del:${w.id}`]);
  });
});
