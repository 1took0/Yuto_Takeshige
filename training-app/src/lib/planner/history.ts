import type { MuscleGroup, PreviousPerformance, StoreId, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { diffDays } from "@/lib/date/trainingDay";
import { getExercise } from "@/lib/catalog/exercises";

/** 記録として数えるセット（完了済みかつ除外されていない） */
export function countedSets(e: WorkoutExercise): WorkoutSet[] {
  return e.sets.filter((s) => s.completed && !s.excluded);
}

/** 完了済みワークアウトを新しい順に */
export function sortByDateDesc(ws: Workout[]): Workout[] {
  return [...ws].filter((w) => w.status === "completed").sort((a, b) => (a.trainingDate < b.trainingDate ? 1 : a.trainingDate > b.trainingDate ? -1 : b.startedAt.localeCompare(a.startedAt)));
}

export interface ExerciseHistoryEntry {
  workout: Workout;
  exercise: WorkoutExercise;
}

/** 種目の実施履歴（新しい順） */
export function exerciseHistory(ws: Workout[], exerciseId: string, storeId?: StoreId): ExerciseHistoryEntry[] {
  const out: ExerciseHistoryEntry[] = [];
  for (const w of sortByDateDesc(ws)) {
    if (storeId && w.storeId !== storeId) continue;
    for (const e of w.exercises) {
      if (e.exerciseId === exerciseId && countedSets(e).length > 0) out.push({ workout: w, exercise: e });
    }
  }
  return out;
}

export function toPrevious(entry: ExerciseHistoryEntry): PreviousPerformance {
  return {
    workoutId: entry.workout.id,
    trainingDate: entry.workout.trainingDate,
    storeId: entry.workout.storeId,
    sets: countedSets(entry.exercise).map((s) => ({ weight: s.weight, reps: s.reps, actualReps: s.actualReps, seconds: s.actualSeconds ?? s.seconds, left: s.left, right: s.right })),
  };
}

/** 直近の使用重量（最後に完了したセットの重量＝ワーキングウェイト） */
export function workingWeight(e: WorkoutExercise): number | undefined {
  const sets = countedSets(e).filter((s) => typeof s.weight === "number");
  if (!sets.length) return undefined;
  return sets[sets.length - 1].weight;
}

export function workingSeconds(e: WorkoutExercise): number | undefined {
  const sets = countedSets(e).filter((s) => typeof (s.actualSeconds ?? s.seconds) === "number");
  if (!sets.length) return undefined;
  return sets[sets.length - 1].actualSeconds ?? sets[sets.length - 1].seconds;
}

/** 全セットで実回数が報告され、目標を達成しているか。未報告があれば false（達成とみなさない） */
export function allTargetsReported(e: WorkoutExercise): boolean {
  const sets = countedSets(e);
  if (!sets.length) return false;
  return sets.every((s) => typeof s.actualReps === "number" && typeof s.reps === "number" && s.actualReps >= s.reps);
}

/** 筋群ごとの最終トレーニング日 */
export function lastTrainedByMuscle(ws: Workout[]): Map<MuscleGroup, string> {
  const m = new Map<MuscleGroup, string>();
  for (const w of sortByDateDesc(ws)) {
    for (const e of w.exercises) {
      if (!countedSets(e).length) continue;
      const def = getExercise(e.exerciseId);
      const muscles = [...(def?.primary ?? e.primary), ...(def?.secondary ?? [])];
      for (const mg of muscles) if (!m.has(mg)) m.set(mg, w.trainingDate);
    }
  }
  return m;
}

export function daysSince(map: Map<MuscleGroup, string>, muscles: MuscleGroup[], today: string): number {
  let min = Infinity;
  for (const mg of muscles) {
    const d = map.get(mg);
    if (d) min = Math.min(min, diffDays(today, d));
  }
  return min;
}

/** 直近 n 回のワークアウトで実施したか */
export function doneInLastN(ws: Workout[], exerciseId: string, n: number): boolean {
  return sortByDateDesc(ws)
    .slice(0, n)
    .some((w) => w.exercises.some((e) => e.exerciseId === exerciseId && countedSets(e).length > 0));
}

/** 店舗でこの種目の利用実績があるか */
export function usedAtStore(ws: Workout[], exerciseId: string, storeId: StoreId): boolean {
  return ws.some((w) => w.storeId === storeId && w.exercises.some((e) => e.exerciseId === exerciseId && countedSets(e).length > 0));
}

export interface RunSummary {
  trainingDate: string;
  totalMin?: number;
  runMin?: number;
  runSpeedKmh?: number;
  longestRunMin?: number;
  plannedRunMin?: number;
}

/** トレッドミルのランニング実績（新しい順） */
export function runHistory(ws: Workout[]): RunSummary[] {
  const out: RunSummary[] = [];
  for (const w of sortByDateDesc(ws)) {
    for (const c of w.cardio) {
      if (c.machine !== "treadmill" || !c.completed) continue;
      const a = c.actual;
      const plannedRunMin = c.plan.filter((s) => s.kind === "run").reduce((x, s) => x + s.durationSec, 0) / 60;
      out.push({
        trainingDate: w.trainingDate,
        totalMin: a?.totalMin,
        runMin: a?.runMin,
        runSpeedKmh: a?.runSpeedKmh,
        longestRunMin: a?.longestRunMin,
        plannedRunMin: plannedRunMin || undefined,
      });
    }
  }
  return out;
}
