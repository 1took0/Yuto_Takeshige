import type { PlanPatch, Workout } from "@/lib/types";
import { describeWishOp, type WishOp } from "@/lib/preferences";
import { isStandingWish, parseWish } from "@/lib/preferences/parse";
import type { CoachReply } from "./intents";

/** 「次から〇〇」「〇〇は苦手」など今後の希望なら、その操作を返す（今日だけの相談なら null） */
export function detectWish(text: string): WishOp[] | null {
  if (!isStandingWish(text)) return null;
  const ops = parseWish(text);
  return ops.length ? ops : null;
}

/**
 * 今後の希望への返答
 * - 希望そのものは呼び出し側で保存する（以降のメニュー作成に反映）
 * - 進行中のメニューに、やりたくない種目（まだ1セットもしていないもの）があれば今日の予定からも外す
 */
export function respondToWish(ops: WishOp[], w: Workout | null): CoachReply {
  const lines = ops.map(describeWishOp);
  const patchOps: PlanPatch["ops"] = [];
  if (w) {
    for (const op of ops) {
      if (op.kind !== "dislike_exercise") continue;
      const e = w.exercises.find((x) => x.exerciseId === op.exerciseId);
      if (e && !e.sets.some((s) => s.completed)) patchOps.push({ op: "remove_exercise", exerciseId: op.exerciseId, reason: "本人の希望" });
    }
  }
  return {
    message: `了解です。次回以降のメニューに反映します：${lines.join("、")}${patchOps.length ? "。今日のメニューからも外しました" : ""}。設定 → メニューの希望 でいつでも見直せます。`,
    patch: patchOps.length ? { message: "希望の反映", ops: patchOps } : undefined,
  };
}
