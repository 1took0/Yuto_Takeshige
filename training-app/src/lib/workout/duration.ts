import type { Workout, WorkoutDurations, WorkoutExercise } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { EQUIPMENT } from "@/lib/catalog/equipment";

export type TrainingCategory = "machine" | "dumbbell" | "bodyweight";

export const CATEGORY_LABEL: Record<TrainingCategory | "cardio", string> = {
  machine: "マシン",
  dumbbell: "ダンベル",
  bodyweight: "自重・体幹",
  cardio: "有酸素",
};

/** 種目の分類（器具から判定） */
export function categoryOf(e: Pick<WorkoutExercise, "exerciseId" | "equipmentId">): TrainingCategory {
  const eqId = e.equipmentId ?? getExercise(e.exerciseId)?.equipmentId;
  if (eqId === "dumbbells") return "dumbbell";
  const cat = EQUIPMENT.find((x) => x.id === eqId)?.category;
  if (cat === "bodyweight" || !eqId) return "bodyweight";
  return "machine";
}

const MAX_EXERCISE_MIN = 60;

/** 1種目の所要時間（秒）。完了時刻があればその間隔、無ければセット数から概算 */
export function exerciseSeconds(e: WorkoutExercise): number {
  const sets = e.sets.filter((s) => s.completed && !s.excluded);
  if (!sets.length) return 0;
  const def = getExercise(e.exerciseId);
  const work = (def?.workSec ?? 40) * (def?.unilateral ? 2 : 1);
  const times = sets
    .map((s) => (s.completedAt ? Date.parse(s.completedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let sec: number;
  if (times.length >= 2) sec = (times[times.length - 1] - times[0]) / 1000 + work;
  else sec = sets.length * work + Math.max(0, sets.length - 1) * e.restSec;
  return Math.min(sec, MAX_EXERCISE_MIN * 60);
}

/**
 * トレーニング時間の内訳を計算する
 * - 取り込みデータ（時刻が無い過去記録）は推測しないため undefined
 * - 合計は開始〜終了の時刻差。無ければ内訳の合計
 */
export function computeDurations(w: Workout): WorkoutDurations | undefined {
  if (w.source === "import") return undefined;
  const sec: Record<TrainingCategory, number> = { machine: 0, dumbbell: 0, bodyweight: 0 };
  for (const e of w.exercises) sec[categoryOf(e)] += exerciseSeconds(e);
  let cardio = 0;
  for (const c of w.cardio) {
    if (!c.completed) continue;
    cardio += c.actual?.totalMin ?? c.plan.reduce((a, s) => a + s.durationSec, 0) / 60;
  }
  const m = (s: number) => Math.round(s / 60);
  const parts = { machineMin: m(sec.machine), dumbbellMin: m(sec.dumbbell), bodyweightMin: m(sec.bodyweight), cardioMin: Math.round(cardio) };
  const sum = parts.machineMin + parts.dumbbellMin + parts.bodyweightMin + parts.cardioMin;
  let totalMin = sum;
  if (w.endedAt && w.startedAt) {
    const span = Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000);
    if (span > 0 && span < 6 * 60) totalMin = Math.max(span, sum);
  }
  return { totalMin, ...parts };
}

/** 表示用の短い文字列（例：合計62分（マシン30・ダンベル20・有酸素12）） */
export function formatDurations(d: WorkoutDurations | undefined): string {
  if (!d || !d.totalMin) return "";
  const parts = [
    d.machineMin ? `マシン${d.machineMin}` : "",
    d.dumbbellMin ? `ダンベル${d.dumbbellMin}` : "",
    d.bodyweightMin ? `自重${d.bodyweightMin}` : "",
    d.cardioMin ? `有酸素${d.cardioMin}` : "",
  ].filter(Boolean);
  return `合計${d.totalMin}分${parts.length ? `（${parts.join("・")}）` : ""}`;
}
