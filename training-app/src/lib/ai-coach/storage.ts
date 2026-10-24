import { allExercises } from "@/lib/catalog/exercises";
import { updateSettings } from "@/lib/db/repo";
import { adjustmentPatch, parseAiAdjustment, policyKey, policySnapshot } from "./import";
import type { Settings } from "@/lib/types";

export const reviewKey = (s: Settings) => JSON.stringify([policyKey(s), s.excludedExerciseIds, s.deletedExerciseIds, s.customExercises]);

export function applyAiPolicy(text: string, expectedKey: string): Promise<Settings> {
  return updateSettings((current) => {
    if (reviewKey(current) !== expectedKey) throw new Error("確認中に設定が変わりました。もう一度「変更内容を確認」を押してください。");
    const adjustment = parseAiAdjustment(text, allExercises());
    const patch = adjustmentPatch(current, adjustment);
    return { ...patch, aiCoachImport: {
      summary: adjustment.summary, appliedAt: new Date().toISOString(),
      before: policySnapshot(current), afterKey: policyKey({ ...current, ...patch }),
    } };
  });
}

export function undoAiPolicy(expectedAppliedAt: string): Promise<Settings> {
  return updateSettings((current) => {
    const last = current.aiCoachImport;
    if (!last || last.appliedAt !== expectedAppliedAt || policyKey(current) !== last.afterKey) {
      throw new Error("取り込み後に方針や条件が変更されています。上書きを避けるため自動では戻せません。再度AIに相談するか設定から修正してください。");
    }
    return { ...last.before, aiCoachImport: undefined };
  });
}
