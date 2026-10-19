import type { CardioEntry, CardioMachine, ExerciseDef, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { newId } from "@/lib/id";
import { computeDurations } from "./duration";
import { trainingDateOf } from "@/lib/date/trainingDay";

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

/**
 * セットの完了を切り替える
 * 完了にしたセットは「目標どおり実施した」として実回数（片手種目は左右、時間種目は秒数）を目標の値で記録する。
 * 次回のメニュー作成で重量を上げる判断に使う。未完了に戻すと実回数も消す。
 */
export function toggleSetCompleted(w: Workout, exId: string, setId: string): Workout {
  return mapExercise(w, exId, (e) => {
    const now = new Date().toISOString();
    const sets = e.sets.map((s) => {
      if (s.id !== setId) return s;
      if (s.completed) {
        return {
          ...s,
          completed: false,
          completedAt: undefined,
          actualReps: undefined,
          actualSeconds: undefined,
          left: s.left ? { ...s.left, actualReps: undefined } : s.left,
          right: s.right ? { ...s.right, actualReps: undefined } : s.right,
        };
      }
      return {
        ...s,
        completed: true,
        excluded: false,
        completedAt: now,
        actualReps: s.actualReps ?? s.reps,
        actualSeconds: s.actualSeconds ?? s.seconds,
        left: s.left ? { ...s.left, actualReps: s.left.actualReps ?? s.left.reps ?? s.reps } : s.left,
        right: s.right ? { ...s.right, actualReps: s.right.actualReps ?? s.right.reps ?? s.reps } : s.right,
      };
    });
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

/** トレーニングを終了。未完了セットは記録から除外する（データは残す）。時間の内訳も計算する */
export function finalizeWorkout(w: Workout, endedAt = new Date().toISOString()): Workout {
  const done = finalizeSets(w, endedAt);
  return { ...done, durations: w.durations?.manual ? w.durations : computeDurations(done) };
}

function finalizeSets(w: Workout, endedAt: string): Workout {
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

/** メニューを自動作成せず、自分で種目を入れていく空のトレーニング */
export function newManualWorkout(storeId: string, storeLabel: string, now = new Date()): Workout {
  const iso = now.toISOString();
  return {
    id: newId("w"),
    trainingDate: trainingDateOf(now),
    startedAt: iso,
    storeId,
    storeLabel,
    exercises: [],
    cardio: [],
    status: "active",
    source: "app",
    ui: { focusedExerciseId: null },
    createdAt: iso,
    updatedAt: iso,
  };
}

/** 有酸素を追加（計画なし。実績だけを入力する） */
export function addCardio(w: Workout, machine: CardioMachine): Workout {
  const entry: CardioEntry = { id: newId("cardio"), machine, plan: [], completed: false, role: "main", rationale: "自分で追加" };
  return touch({ ...w, cardio: [...w.cardio, entry] });
}

/** 有酸素を外す */
export function removeCardio(w: Workout, cardioId: string): Workout {
  return touch({ ...w, cardio: w.cardio.filter((c) => c.id !== cardioId) });
}

/** 種目を任意の位置へ移動（長押しドラッグの並べ替え用） */
export function moveExerciseTo(w: Workout, exId: string, toIndex: number): Workout {
  const from = w.exercises.findIndex((e) => e.id === exId);
  if (from < 0) return w;
  const to = Math.max(0, Math.min(w.exercises.length - 1, toIndex));
  if (from === to) return w;
  const exercises = [...w.exercises];
  const [moved] = exercises.splice(from, 1);
  exercises.splice(to, 0, moved);
  return touch({ ...w, exercises });
}

export type WorkoutItem = { kind: "exercise"; id: string } | { kind: "cardio"; id: string };

/**
 * 種目と有酸素を合わせた表示順
 * - 並べ替えたことがなければ、ウォームアップの有酸素 → 種目 → メインの有酸素
 * - 後から追加した種目は最後の種目の後ろ、有酸素はウォームアップなら先頭・それ以外は末尾に入れる
 */
export function orderedItems(w: Workout): WorkoutItem[] {
  const ex: WorkoutItem[] = w.exercises.map((e) => ({ kind: "exercise", id: e.id }));
  const warm: WorkoutItem[] = w.cardio.filter((c) => c.role === "warmup").map((c) => ({ kind: "cardio", id: c.id }));
  const main: WorkoutItem[] = w.cardio.filter((c) => c.role !== "warmup").map((c) => ({ kind: "cardio", id: c.id }));
  const all = [...warm, ...ex, ...main];
  if (!w.itemOrder?.length) return all;
  const byId = new Map(all.map((it) => [it.id, it]));
  const out: WorkoutItem[] = w.itemOrder.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const placed = new Set(out.map((it) => it.id));
  for (const it of all) {
    if (placed.has(it.id)) continue;
    if (it.kind === "exercise") {
      let last = -1;
      out.forEach((x, i) => x.kind === "exercise" && (last = i));
      if (last >= 0) out.splice(last + 1, 0, it);
      else {
        const firstMain = out.findIndex((x) => x.kind === "cardio" && w.cardio.find((c) => c.id === x.id)?.role !== "warmup");
        out.splice(firstMain >= 0 ? firstMain : out.length, 0, it);
      }
    } else if (warm.some((x) => x.id === it.id)) out.unshift(it);
    else out.push(it);
    placed.add(it.id);
  }
  // 種目どうしの順番は種目の並び（番号）に従い、有酸素との位置関係だけを itemOrder から取る
  const slots = out.map((x, i) => (x.kind === "exercise" ? i : -1)).filter((i) => i >= 0);
  slots.forEach((slot, k) => (out[slot] = ex[k]));
  return out;
}

/** 種目・有酸素を任意の位置へ移動（長押しドラッグの並べ替え用）。種目の並び（番号）も合わせる */
export function moveItemTo(w: Workout, id: string, toIndex: number): Workout {
  const items = orderedItems(w).map((it) => it.id);
  const from = items.indexOf(id);
  if (from < 0) return w;
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (from === to) return w;
  items.splice(from, 1);
  items.splice(to, 0, id);
  const pos = new Map(items.map((x, i) => [x, i]));
  const exercises = [...w.exercises].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  return touch({ ...w, exercises, itemOrder: items });
}
