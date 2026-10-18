import { z } from "zod";

/** Claude から受け取る構造化パッチのスキーマ（予定のみ変更。実績には触れない） */
export const SegmentSchema = z.object({
  kind: z.enum(["walk", "run", "bike", "cooldown", "warmup"]),
  durationSec: z.number().int().min(30).max(3600),
  speedKmh: z.number().min(0).max(25).nullable(),
  speedMaxKmh: z.number().min(0).max(25).nullable(),
  inclinePct: z.number().min(0).max(20).nullable(),
  level: z.number().int().min(0).max(40).nullable(),
  label: z.string().nullable(),
});

export const PlanPatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove_exercise"), exerciseId: z.string(), reason: z.string().nullable() }),
  z.object({ op: z.literal("add_exercise"), exerciseId: z.string(), sets: z.number().int().min(1).max(6).nullable(), weight: z.number().min(0).max(500).nullable(), reps: z.number().int().min(1).max(50).nullable(), reason: z.string().nullable() }),
  z.object({ op: z.literal("replace_exercise"), from: z.string(), to: z.string(), reason: z.string().nullable() }),
  z.object({ op: z.literal("set_weight"), exerciseId: z.string(), weight: z.number().min(0).max(500), reason: z.string().nullable() }),
  z.object({ op: z.literal("set_sets"), exerciseId: z.string(), sets: z.number().int().min(1).max(8), reason: z.string().nullable() }),
  z.object({ op: z.literal("set_reps"), exerciseId: z.string(), reps: z.number().int().min(1).max(50), reason: z.string().nullable() }),
  z.object({ op: z.literal("set_cardio"), machine: z.enum(["bike", "treadmill"]), segments: z.array(SegmentSchema).min(1).max(20), reason: z.string().nullable() }),
  z.object({ op: z.literal("remove_cardio"), machine: z.enum(["bike", "treadmill"]), reason: z.string().nullable() }),
  z.object({ op: z.literal("reorder"), exerciseIds: z.array(z.string()), reason: z.string().nullable() }),
]);

export const CoachResponseSchema = z.object({
  /** ユーザーへの返答（日本語、簡潔に） */
  message: z.string(),
  /** メニュー変更の提案。変更不要なら空配列 */
  ops: z.array(PlanPatchOpSchema),
  /** ヒアリング画面へ誘導するか（「ジムに来た」など） */
  navigateToStart: z.boolean(),
});

export type CoachResponse = z.infer<typeof CoachResponseSchema>;

export const CoachRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
  context: z.object({
    today: z.string(),
    workout: z.unknown().nullable(),
    recentHistory: z.array(z.unknown()).max(12),
    availableExerciseIds: z.array(z.string()),
    storeName: z.string().nullable(),
  }),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;
