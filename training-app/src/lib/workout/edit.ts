import type { ExerciseDef, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { newId } from "@/lib/id";

/**
 * ワークアウト編集の純粋関数群
 * - すべて新しい Workout を返す（イミュータブル）
 * - 実績の自動補完はしない
 */

function touch(w: Workout): Workout {
  return { ...w, updatedAt: new Date().toISOString() };
}

function mapExercise(w: Workout, exId: string, fn: (e: WorkoutExercise) => WorkoutExercise): Workout {
  return touch({ ...w, exercises: w.exercises.map((e) => (e.id === exId ? fn(e) : e)) });
}

export function updateSet(w: Workout, exId: string, setId: string, patch: Partial<WorkoutSet>): Workout {
  return mapExercise(w, exId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

export function toggleSetCompleted(w: Workout, exId: string, setId: string): Workout {
  return mapExercise(w, exId, (e) => {
    const sets = e.sets.map((s) => (s.id === setId ? { ...s, completed: !s.completed, excluded: s.completed ? s.excluded : false } : s));
    const anyDone = sets.some((s) => s.completed);
    return { ...e, sets, status: anyDone ? (e.status === "skipped" ? "planned" : e.status) : e.status };
  });
}

/** 新しいセットを追加。直前のセットの重量・回数を初期値にする */
export function addSet(w: Workout, exId: string): Workout {
  return mapExercise(w, exId, (e) => {
    const last = [...e.sets].reverse().find((s) => !s.excluded) ?? e.sets[e.sets.length - 1];
    const def = getExercise(e.exerciseId);
    const next: WorkoutSet = {
      id: newId("set"),
      weight: last?.weight,
      reps: last?.reps ?? def?.defaultReps,
      seconds: last?.seconds ?? def?.defaultSeconds,
      left: last?.left ? { weight: last.left.weight, reps: last.left.reps } : undefined,
      right: last?.right ? { weight: last.right.weight, reps: last.right.reps } : undefined,
      completed: false,
      excluded: false,
    };
    return { ...e, sets: [...e.sets, next] };
  });
}

export function removeSet(w: Workout, exId: string, setId: string): Workout {
  return mapExercise(w, exId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
}

export function setExcluded(w: Workout, exId: string, setId: string, excluded: boolean): Workout {
  return updateSet(w, exId, setId, { excluded, ...(excluded ? { completed: false } : {}) });
}

export function setExerciseStatus(w: Workout, exId: string, status: WorkoutExercise["status"]): Workout {
  return mapExercise(w, exId, (e) => ({ ...e, status }));
}

export function updateExercise(w: Workout, exId: string, patch: Partial<WorkoutExercise>): Workout {
  return mapExercise(w, exId, (e) => ({ ...e, ...patch }));
}

export function removeExercise(w: Workout, exId: string): Workout {
  return touch({ ...w, exercises: w.exercises.filter((e) => e.id !== exId) });
}

export function moveExercise(w: Workout, exId: string, dir: -1 | 1): Workout {
  const idx = w.exercises.findIndex((e) => e.id === exId);
  const to = idx + dir;
  if (idx < 0 || to < 0 || to >= w.exercises.length) return w;
  const arr = [...w.exercises];
  [arr[idx], arr[to]] = [arr[to], arr[idx]];
  return touch({ ...w, exercises: arr });
}

export interface NewExerciseOptions {
  sets?: number;
  weight?: number;
  reps?: number;
  seconds?: number;
  rationale?: string;
  weightReference?: WorkoutExercise["weightReference"];
  /** 1セット目を軽くする（ウォームアップ） */
  rampFirst?: boolean;
}

export function buildExercise(def: ExerciseDef, opts: NewExerciseOptions = {}): WorkoutExercise {
  const n = Math.max(1, opts.sets ?? def.defaultSets);
  const sets: WorkoutSet[] = [];
  for (let i = 0; i < n; i++) {
    let weight = opts.weight;
    if (weight !== undefined && opts.rampFirst && i === 0 && n > 1 && def.increment > 0) {
      weight = Math.max(def.increment, weight - def.increment);
    }
    const s: WorkoutSet = {
      id: newId("set"),
      completed: false,
      excluded: false,
    };
    if (def.loadType === "time") {
      s.seconds = opts.seconds ?? def.defaultSeconds;
    } else {
      s.reps = opts.reps ?? def.defaultReps;
      if (def.loadType !== "reps") s.weight = weight;
    }
    if (def.unilateral && def.loadType !== "time") {
      s.left = { weight, reps: s.reps };
      s.right = { weight, reps: s.reps };
    }
    sets.push(s);
  }
  return {
    id: newId("ex"),
    exerciseId: def.id,
    name: def.name,
    equipmentId: def.equipmentId,
    primary: def.primary,
    sets,
    restSec: def.restSec,
    rationale: opts.rationale,
    status: "planned",
    weightReference: opts.weightReference ?? (opts.weight === undefined ? "none" : "same_store"),
  };
}

export function addExercise(w: Workout, exerciseId: string, opts: NewExerciseOptions = {}, index?: number): Workout {
  const def = getExercise(exerciseId);
  if (!def) return w;
  const ex = buildExercise(def, opts);
  const arr = [...w.exercises];
  if (index === undefined || index >= arr.length) arr.push(ex);
  else arr.splice(index, 0, ex);
  return touch({ ...w, exercises: arr });
}

// ---------- 進捗 ----------
export interface Progress {
  doneSets: number;
  plannedSets: number;
  doneExercises: number;
  totalExercises: number;
  remainingExercises: number;
  /** 推定残り時間(秒)。未完了セット分 + 有酸素の未完了分 */
  estRemainingSec: number;
  percent: number;
}

export function isSetCounted(s: WorkoutSet): boolean {
  return !s.excluded;
}

export function isExerciseDone(e: WorkoutExercise): boolean {
  if (e.status === "skipped") return true;
  const active = e.sets.filter(isSetCounted);
  return active.length > 0 && active.every((s) => s.completed);
}

export function progressOf(w: Workout): Progress {
  let doneSets = 0;
  let plannedSets = 0;
  let doneExercises = 0;
  let est = 0;
  for (const e of w.exercises) {
    if (e.status === "skipped") {
      doneExercises++;
      continue;
    }
    const def = getExercise(e.exerciseId);
    const active = e.sets.filter(isSetCounted);
    const done = active.filter((s) => s.completed).length;
    plannedSets += active.length;
    doneSets += done;
    if (active.length > 0 && done === active.length) doneExercises++;
    const remaining = active.length - done;
    if (remaining > 0) {
      const work = (def?.workSec ?? 40) * (def?.unilateral ? 2 : 1);
      est += remaining * work + Math.max(0, remaining - 1) * e.restSec + (done === 0 ? 45 : 0);
    }
  }
  for (const c of w.cardio) {
    if (c.completed || c.skipped) continue;
    est += c.plan.reduce((a, s) => a + s.durationSec, 0);
  }
  const total = w.exercises.length;
  return {
    doneSets,
    plannedSets,
    doneExercises,
    totalExercises: total,
    remainingExercises: total - doneExercises,
    estRemainingSec: est,
    percent: plannedSets ? Math.round((doneSets / plannedSets) * 100) : 0,
  };
}

/** トレーニングを終了。未完了セットは記録から除外する（データは残す） */
export function finalizeWorkout(w: Workout, endedAt = new Date().toISOString()): Workout {
  return {
    ...w,
    status: "completed",
    endedAt,
    exercises: w.exercises.map((e) => {
      const sets = e.sets.map((s) => (s.completed ? s : { ...s, excluded: true }));
      const anyDone = sets.some((s) => s.completed);
      return { ...e, sets, status: anyDone ? "done" : "skipped" };
    }),
    updatedAt: endedAt,
  };
}

/** 保存後の修正用：completed に戻す（active には戻さない） */
export function reopenForEdit(w: Workout): Workout {
  return { ...w, updatedAt: new Date().toISOString() };
}
