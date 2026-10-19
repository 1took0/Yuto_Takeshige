import { z } from "zod";

/**
 * 共有用に記録を整形・検証する
 * - 共有するのは「誰が・いつ・どこで・どれくらい」だけ（種目名・重量・回数などの細かい内容は共有しない）
 * - 体調・痛み・メモなどヒアリング内容（intake）、メモ、UI 状態も共有しない
 * - 以前の形式（種目の詳細つき）で届いた・保存されていた記録も、ここで要約だけにする
 */
const num = z.number().finite().min(0).max(10000).optional();
const count = z.number().int().min(0).max(1000);
const str = (max: number) => z.string().max(max).optional();

/** 以前の形式から要約を作るための最小限の形（それ以外のフィールドは読まずに捨てる） */
const LegacyExercise = z.object({ sets: z.array(z.object({ completed: z.boolean(), excluded: z.boolean() })).max(30) });
const LegacyCardio = z.object({ completed: z.boolean(), skipped: z.boolean().optional(), actual: z.object({ totalMin: num }).partial().optional() });

const DurationsSchema = z
  .object({ totalMin: num, machineMin: num, dumbbellMin: num, bodyweightMin: num, cardioMin: num, manual: z.boolean().optional() })
  .partial();

const InputSchema = z.object({
  id: z.string().min(1).max(100),
  trainingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string().max(40),
  endedAt: z.string().max(40).optional(),
  storeId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  storeLabel: str(30),
  status: z.literal("completed"),
  source: z.enum(["app", "import"]),
  durations: DurationsSchema.optional(),
  exerciseCount: count.optional(),
  setCount: count.optional(),
  cardioMin: num,
  exercises: z.array(LegacyExercise).max(30).optional(),
  cardio: z.array(LegacyCardio).max(6).optional(),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});

/** 共有される記録（要約のみ） */
export interface SharedWorkout {
  id: string;
  trainingDate: string;
  startedAt: string;
  endedAt?: string;
  storeId: string;
  storeLabel?: string;
  status: "completed";
  source: "app" | "import";
  /** トレーニング時間の内訳（分） */
  durations?: z.infer<typeof DurationsSchema>;
  /** 実施した種目数・セット数 */
  exerciseCount: number;
  setCount: number;
  /** 有酸素の合計（分） */
  cardioMin?: number;
  createdAt: string;
  updatedAt: string;
}

/** サーバー側で検証し、要約だけを返す（不正なら null） */
export function sanitizeWorkout(input: unknown): SharedWorkout | null {
  const r = InputSchema.safeParse(input);
  if (!r.success) return null;
  const { exercises, cardio, exerciseCount, setCount, cardioMin, durations, endedAt, storeLabel, ...base } = r.data;
  const doneSets = (e: z.infer<typeof LegacyExercise>) => e.sets.filter((s) => s.completed && !s.excluded).length;
  const out: SharedWorkout = {
    ...base,
    exerciseCount: exerciseCount ?? exercises?.filter((e) => doneSets(e) > 0).length ?? 0,
    setCount: setCount ?? exercises?.reduce((a, e) => a + doneSets(e), 0) ?? 0,
  };
  if (endedAt !== undefined) out.endedAt = endedAt;
  if (storeLabel !== undefined) out.storeLabel = storeLabel;
  if (durations) out.durations = durations;
  const legacyCardio = cardio?.filter((c) => c.completed && !c.skipped).reduce((a, c) => a + (c.actual?.totalMin ?? 0), 0);
  const cm = cardioMin ?? (legacyCardio || undefined);
  if (cm !== undefined) out.cardioMin = cm;
  return out;
}

export const DisplayNameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(20));

export const CredsSchema = z.object({
  userId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  token: z.string().regex(/^[a-f0-9]{32,128}$/),
});
