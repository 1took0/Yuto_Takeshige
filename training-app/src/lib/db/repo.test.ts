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

describe("店舗の追加・変更・削除", () => {
  it("追加した店舗は器具がすべて未確認で、メニューも作れる", async () => {
    const { addStore, listStoreEquipment: lse, getSettings } = await import("./repo");
    const { generatePlan } = await import("@/lib/planner");
    await ensureSeeded();
    const s = await addStore("LifeFit 北白川店");
    expect(s).toMatchObject({ name: "LifeFit 北白川店", shortName: "北白川", custom: true });
    expect(s.id).toMatch(/^custom-/);
    const eq = await lse(s.id);
    expect(eq.length).toBeGreaterThan(20);
    expect(eq.every((r) => r.available && !r.confirmed)).toBe(true);
    expect((await getSettings()).customStores).toHaveLength(1);
    const plan = generatePlan({
      intake: { storeId: s.id, timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" },
      history: buildSeedWorkouts(),
      storeEquipment: await lse(),
      settings: { excludedExerciseIds: [] },
      now: new Date("2026-10-18T10:00:00+09:00"),
    }).workout;
    expect(plan.storeLabel).toBe("LifeFit 北白川店");
    expect(plan.exercises.length).toBeGreaterThan(3);
    // 他店舗の記録は参考値扱い
    expect(plan.exercises.find((e) => e.exerciseId === "leg_press")?.weightReference).toBe("other_store");
  });

  it("器具を既存店舗からコピーできる（ない設定を引き継ぎ、未確認扱い）", async () => {
    const { addStore, listStoreEquipment: lse } = await import("./repo");
    await ensureSeeded();
    const s = await addStore("コピー店", "higashiyama-nijo");
    const curl = (await lse(s.id)).find((r) => r.equipmentId === "biceps_curl_machine")!;
    expect(curl).toMatchObject({ available: false, confirmed: false });
  });

  it("名前変更・削除。削除しても記録は残り、店舗名は記録に保存される", async () => {
    const { addStore, renameStore, deleteStore, listStoreEquipment: lse, getSettings } = await import("./repo");
    const { workoutStoreName } = await import("@/lib/catalog/stores");
    await ensureSeeded();
    const s = await addStore("A店");
    await renameStore(s.id, "LifeFit B店");
    expect((await getSettings()).customStores![0]).toMatchObject({ name: "LifeFit B店", shortName: "B" });
    const w = { ...buildSeedWorkouts()[0], id: "w-custom", storeId: s.id, storeLabel: undefined };
    await saveWorkout(w);
    await deleteStore(s.id);
    expect((await getSettings()).customStores).toHaveLength(0);
    expect(await lse(s.id)).toHaveLength(0);
    const kept = (await listCompletedWorkouts()).find((x) => x.id === "w-custom")!;
    expect(kept.storeLabel).toBe("LifeFit B店");
    expect(workoutStoreName(kept, true)).toBe("B");
  });

  it("標準の店舗は削除できない・同名は追加できない", async () => {
    const { addStore, deleteStore, listStoreEquipment: lse } = await import("./repo");
    await ensureSeeded();
    await deleteStore("ichijoji");
    expect((await lse("ichijoji")).length).toBeGreaterThan(0);
    await addStore("X店");
    await expect(addStore("X店")).rejects.toThrow(/同じ名前/);
  });
});
