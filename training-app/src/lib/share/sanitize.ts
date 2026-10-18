import { z } from "zod";

/**
 * 共有用に記録を整形・検証する
 * - 体調・痛み・メモなどヒアリング内容（intake）と UI 状態は共有しない
 * - 未知のフィールドは捨て、既知のフィールドだけを取り出す
 */
const num = z.number().finite().min(0).max(10000).optional();
const side = z.object({ weight: num, reps: num, actualReps: num }).partial().optional();
const str = (max: number) => z.string().max(max).optional();

const SetSchema = z.object({
  id: z.string().max(80),
  weight: num,
  reps: num,
  actualReps: num,
  seconds: num,
  actualSeconds: num,
  left: side,
  right: side,
  completed: z.boolean(),
  excluded: z.boolean(),
  feel: z.enum(["easy", "ok", "hard"]).optional(),
  note: str(200),
});

const ExerciseSchema = z.object({
  id: z.string().max(80),
  exerciseId: z.string().max(60),
  name: z.string().max(60),
  equipmentId: str(60),
  primary: z.array(z.string().max(30)).max(10),
  sets: z.array(SetSchema).max(20),
  restSec: z.number().min(0).max(600),
  note: str(200),
  status: z.enum(["planned", "done", "skipped"]),
});

const SegmentSchema = z.object({
  id: z.string().max(80),
  kind: z.enum(["walk", "run", "bike", "cooldown", "warmup"]),
  durationSec: z.number().min(0).max(7200),
  speedKmh: num,
  speedMaxKmh: num,
  inclinePct: num,
  level: num,
  label: str(40),
});

const CardioSchema = z.object({
  id: z.string().max(80),
  machine: z.enum(["bike", "treadmill"]),
  plan: z.array(SegmentSchema).max(30),
  actual: z
    .object({ totalMin: num, runMin: num, runSpeedKmh: num, walkSpeedKmh: num, distanceKm: num, inclinePct: num, level: num, longestRunMin: num, note: str(200) })
    .partial()
    .optional(),
  completed: z.boolean(),
  skipped: z.boolean().optional(),
  role: z.enum(["warmup", "main"]),
});

export const SharedWorkoutSchema = z.object({
  id: z.string().min(1).max(100),
  trainingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string().max(40),
  endedAt: z.string().max(40).optional(),
  storeId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  storeLabel: str(30),
  exercises: z.array(ExerciseSchema).max(30),
  cardio: z.array(CardioSchema).max(6),
  status: z.literal("completed"),
  source: z.enum(["app", "import"]),
  notes: str(500),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});

export type SharedWorkout = z.infer<typeof SharedWorkoutSchema>;

/** サーバー側で検証し、既知のフィールドだけを返す（不正なら null） */
export function sanitizeWorkout(input: unknown): SharedWorkout | null {
  const r = SharedWorkoutSchema.safeParse(input);
  return r.success ? r.data : null;
}

export const DisplayNameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(20));

export const CredsSchema = z.object({
  userId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  token: z.string().regex(/^[a-f0-9]{32,128}$/),
});
