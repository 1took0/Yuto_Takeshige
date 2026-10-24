import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allExercises } from "@/lib/catalog/exercises";
import { TrainingDB, setDb } from "@/lib/db";
import { getSettings, updateSettings, saveWorkout, listAllWorkouts, setStoreEquipment, listStoreEquipment } from "@/lib/db/repo";
import { adjustmentPatch, describeAdjustment, parseAiAdjustment } from "./import";
import { applyAiPolicy, reviewKey, undoAiPolicy } from "./storage";

const payload = (preferences: object = { cardio: "walk", progressionMode: "cautious" }) => JSON.stringify({ format: "training-coach-policy", version: 1, summary: "続けやすい方針", preferences });
let database: TrainingDB;
beforeEach(() => { database = new TrainingDB(`ai-import-${crypto.randomUUID()}`); setDb(database); });
afterEach(async () => { await database.delete(); });

describe("AIの方針の読み取り", () => {
  it("説明付きの単一JSONを受け付け、範囲の上下限を保持する", () => {
    const a = parseAiAdjustment(`会話で合意しました\n\`\`\`json\n${payload({ exerciseRules: [{ exerciseId: "chest_press", sets: 1, reps: 30, restSec: 300 }, { exerciseId: "plank", sets: 6, seconds: 5, restSec: 15 }] })}\n\`\`\``, allExercises());
    expect(a.preferences?.exerciseRules?.[0]).toMatchObject({ sets: 1, reps: 30, restSec: 300 });
  });
  it.each([
    { intensity: "maximum" }, { timeLimitMin: 31 }, { profile: {} },
    { progression: {} }, { progression: { requiredSuccesses: 0 } }, { progression: { requiredSuccesses: 6 } },
    { progression: { minSessionsAtWeight: 9 } }, { progression: { maxIncreasePercent: 21 } },
    { progression: { repRange: { min: 12, max: 8 } } }, { progression: { repRange: { min: 1, max: 21 } } },
    { progression: { strategy: "weekly" } }, { progression: { requiredSuccesses: "3" } },
    { exerciseRules: [{ exerciseId: "chest_press", sets: 7 }] },
    { exerciseRules: [{ exerciseId: "chest_press", reps: "10" }] },
    { exerciseRules: [{ exerciseId: "plank", reps: 10 }] },
    { exerciseRules: [{ exerciseId: "chest_press", seconds: 10 }] },
    { exerciseRules: [{ exerciseId: "chest_press", weight: 100 }] },
    { exerciseRules: [{ exerciseId: "chest_press", sets: 2 }, { exerciseId: "chest_press", sets: 3 }] },
    { exerciseOrder: ["missing"] }, { exerciseOrder: ["chest_press", "chest_press"] },
  ])("不正な形式・未知ID・重複・未対応の負荷指定を拒否する: %j", (p) => {
    expect(() => parseAiAdjustment(payload(p), allExercises())).toThrow();
  });
  it("形式・版・空の変更・複数ブロック・過大な本文を拒否する", () => {
    for (const text of ["自由文のみ", payload().replace('"version":1', '"version":2'), payload({}), `\`\`\`json\n${payload()}\n\`\`\`\n\`\`\`json\n${payload()}\n\`\`\``, "x".repeat(40001), payload().replace('"preferences":', '"__proto__":{"sharing":true},"preferences":')]) {
      expect(() => parseAiAdjustment(text, allExercises())).toThrow();
    }
  });
  it("配列は全置換し、指定外の健康情報・目標を保持、矛盾を拒否する", async () => {
    const s = await updateSettings({ preferences: { chronicPain: "腰", dislikedExerciseIds: ["chest_press"], age: 45 }, excludedExerciseIds: ["lat_pulldown"] });
    const patch = adjustmentPatch(s, parseAiAdjustment(payload({ dislikedExerciseIds: [] }), allExercises()));
    expect(patch.preferences).toMatchObject({ chronicPain: "腰", age: 45, dislikedExerciseIds: [] });
    const conflict = parseAiAdjustment(payload({ exerciseOrder: ["lat_pulldown"] }), allExercises());
    expect(() => adjustmentPatch(s, conflict)).toThrow(/矛盾/);
    expect(s.preferences?.dislikedExerciseIds).toEqual(["chest_press"]);
    expect(describeAdjustment(s, parseAiAdjustment(payload({ dislikedExerciseIds: [] }), allExercises()), allExercises())[0]).toContain("チェストプレス → なし");
  });
});

describe("方針の保存と取り消し", () => {
  it("重量条件は厳格に検証し、全体置換・省略保持・null解除と取り消しができる", async () => {
    const initial = await updateSettings({ preferences: { progression: { requiredSuccesses: 2, maxIncreasePercent: 5 } } });
    const text = payload({ progression: { requiredSuccesses: 5, minSessionsAtWeight: 8, maxIncreasePercent: 1, strategy: "reps_first", repRange: { min: 1, max: 20 } } });
    const saved = await applyAiPolicy(text, reviewKey(initial));
    expect(saved.preferences?.progression?.minSessionsAtWeight).toBe(8);
    const replaced = await applyAiPolicy(payload({ progression: { requiredSuccesses: 3 } }), reviewKey(saved));
    expect(replaced.preferences?.progression).toEqual({ requiredSuccesses: 3 });
    const retained = await applyAiPolicy(payload({ cardio: "none" }), reviewKey(replaced));
    expect(retained.preferences?.progression).toEqual({ requiredSuccesses: 3 });
    const cleared = await applyAiPolicy(payload({ progression: null }), reviewKey(retained));
    expect(cleared.preferences?.progression).toBeUndefined();
    expect((await undoAiPolicy(cleared.aiCoachImport!.appliedAt)).preferences?.progression).toEqual({ requiredSuccesses: 3 });
  });
  it("明示的な保存まで変更せず、実績・器具・プロフィールを保持して再読込と取り消しができる", async () => {
    const initial = await updateSettings({ preferences: { chronicPain: "膝", cardio: "none" }, profile: { userId: "u", displayName: "本人", shareToken: "secret", createdAt: "now" } });
    await saveWorkout({ id: "active", status: "active", source: "app", storeId: "ichijoji", trainingDate: "2026-10-25", createdAt: "now", updatedAt: "now", startedAt: "now", exercises: [], cardio: [] });
    await setStoreEquipment("ichijoji", "chest_press", { stepKg: 2.5 });
    const records = await listAllWorkouts(); const equipment = await listStoreEquipment();
    parseAiAdjustment(payload(), allExercises());
    expect((await getSettings()).preferences).toEqual(initial.preferences);
    await applyAiPolicy(payload(), reviewKey(initial));
    const saved = await getSettings();
    expect(saved.preferences).toMatchObject({ chronicPain: "膝", cardio: "walk", progressionMode: "cautious" });
    expect(saved.lastCardio).toBe("walk");
    expect(saved.profile).toEqual(initial.profile);
    expect(await listAllWorkouts()).toEqual(records);
    expect(await listStoreEquipment()).toEqual(equipment);
    await updateSettings({ theme: "dark" });
    const restored = await undoAiPolicy(saved.aiCoachImport!.appliedAt);
    expect(restored.preferences).toEqual(initial.preferences);
    expect(restored.lastCardio).toBe(initial.lastCardio);
    expect(restored.theme).toBe("dark");
    expect(restored.aiCoachImport).toBeUndefined();
  });
  it("古い確認結果と、取り込み後の手修正を上書きしない", async () => {
    const s = await getSettings();
    await updateSettings({ preferences: { intensity: "light" } });
    await expect(applyAiPolicy(payload(), reviewKey(s))).rejects.toThrow(/確認中/);
    const saved = await applyAiPolicy(payload(), reviewKey(await getSettings()));
    await updateSettings({ preferences: { ...saved.preferences, cardio: "run" } });
    await expect(undoAiPolicy(saved.aiCoachImport!.appliedAt)).rejects.toThrow(/上書き/);
    expect((await getSettings()).preferences?.cardio).toBe("run");
  });
  it("同時の別設定更新を失わず、壊れた返却文では全項目未変更", async () => {
    const s = await getSettings();
    await Promise.all([applyAiPolicy(payload(), reviewKey(s)), updateSettings({ vibration: false })]);
    const saved = await getSettings();
    expect(saved.vibration).toBe(false);
    expect(saved.preferences?.cardio).toBe("walk");
    await expect(applyAiPolicy(payload({ exerciseRules: [{ exerciseId: "fake", sets: 2 }] }), reviewKey(saved))).rejects.toThrow();
    expect(await getSettings()).toEqual(saved);
  });
});
