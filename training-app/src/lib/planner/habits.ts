import type { CardioEntry, CardioMachine, Workout, WorkoutExercise } from "@/lib/types";
import { diffDays } from "@/lib/date/trainingDay";
import { getExercise } from "@/lib/catalog/exercises";
import { EQUIPMENT } from "@/lib/catalog/equipment";
import { orderedItems } from "@/lib/workout/edit";
import { countedSets, sortByDateDesc } from "./history";

/**
 * これまでの記録（自分で入力したメニュー・自動作成のメニューとも）から、その人の好みを読み取る
 * - よく行う種目（実際にセットを終えた種目だけ。自動作成で入っても行わなかった種目は数えない）
 * - 並び順：種目ごと、器具の種類ごと（ダンベル→マシン など）、バイク・トレッドミルの位置（最初／最後）
 * 自動作成のメニューで、その種目を選びやすくし、並び順もそれに合わせる
 */

export interface TrainingHabits {
  /** 参考にした記録の回数 */
  count: number;
  /** 種目ごとの実施割合（0〜1。参考にした回数のうち何割で行ったか） */
  freq: Map<string, number>;
  /** 種目ごとの平均の位置（0=最初 〜 1=最後） */
  position: Map<string, number>;
  /** 器具の種類ごとの平均の位置（dumbbell / machine / free / bodyweight / bench） */
  groupPosition: Map<string, number>;
  /** バイク・トレッドミルの平均の位置と、行った回数 */
  cardioPosition: Map<CardioMachine, { pos: number; n: number }>;
}
/** 以前の名前（自分で入力したメニューだけから読み取っていたころ） */
export type ManualHabits = TrainingHabits;

/** 自分で入力したメニューか（以前の版で作った、ヒアリング無しの記録も含める） */
export function isManualWorkout(w: Workout): boolean {
  return w.manual === true || (!w.intake && w.source === "app");
}

/** 器具の種類（並び順の学習用）。ダンベルはほかのフリーウェイトと分ける */
export function equipmentGroupOf(exerciseId: string): string | undefined {
  const def = getExercise(exerciseId);
  if (!def) return undefined;
  if (def.equipmentId === "dumbbells") return "dumbbell";
  return EQUIPMENT.find((e) => e.id === def.equipmentId)?.category ?? (def.loadType === "reps" || def.loadType === "time" ? "bodyweight" : undefined);
}

const cardioDone = (c: CardioEntry) => !c.skipped && (c.completed || (c.actual?.totalMin ?? 0) > 0);
const firstDoneAt = (e: WorkoutExercise) => countedSets(e).map((s) => s.completedAt).filter((t): t is string => !!t).sort()[0];

type DoneItem = { kind: "exercise"; exerciseId: string } | { kind: "cardio"; machine: CardioMachine };

/**
 * 1回のトレーニングで実際に行った順番
 * 表示の順（長押しで並べ替えた順を含む）を基本に、種目どうしはセットを終えた時刻の順に直す
 */
export function doneOrder(w: Workout): DoneItem[] {
  const exById = new Map(w.exercises.map((e) => [e.id, e]));
  const cById = new Map(w.cardio.map((c) => [c.id, c]));
  const items = orderedItems(w).filter((it) => (it.kind === "exercise" ? countedSets(exById.get(it.id)!).length > 0 : cardioDone(cById.get(it.id)!)));
  const exSeq = items.filter((it) => it.kind === "exercise").map((it) => exById.get(it.id)!);
  if (exSeq.every((e) => firstDoneAt(e))) exSeq.sort((a, b) => firstDoneAt(a)!.localeCompare(firstDoneAt(b)!));
  let k = 0;
  return items.map((it) => (it.kind === "exercise" ? { kind: "exercise" as const, exerciseId: exSeq[k++].exerciseId } : { kind: "cardio" as const, machine: cById.get(it.id)!.machine }));
}

export function trainingHabits(history: Workout[], today: string, opts: { maxSessions?: number; withinDays?: number; onlyManual?: boolean } = {}): TrainingHabits {
  const sessions = sortByDateDesc(history)
    .filter((w) => (!opts.onlyManual || isManualWorkout(w)) && diffDays(today, w.trainingDate) < (opts.withinDays ?? 56))
    .slice(0, opts.maxSessions ?? 8);
  const count = new Map<string, number>();
  const sum = new Map<string, number>();
  const n = new Map<string, number>();
  const add = (key: string, pos: number) => {
    sum.set(key, (sum.get(key) ?? 0) + pos);
    n.set(key, (n.get(key) ?? 0) + 1);
  };
  let used = 0;
  for (const w of sessions) {
    const done = doneOrder(w);
    if (!done.some((d) => d.kind === "exercise")) continue;
    used++;
    const seen = new Set<string>();
    done.forEach((d, i) => {
      const pos = done.length === 1 ? 0.5 : i / (done.length - 1);
      if (d.kind === "cardio") return add(`cardio:${d.machine}`, pos);
      if (!seen.has(d.exerciseId)) count.set(d.exerciseId, (count.get(d.exerciseId) ?? 0) + 1);
      seen.add(d.exerciseId);
      add(`ex:${d.exerciseId}`, pos);
      const g = equipmentGroupOf(d.exerciseId);
      if (g) add(`group:${g}`, pos);
    });
  }
  const freq = new Map<string, number>();
  const position = new Map<string, number>();
  const groupPosition = new Map<string, number>();
  const cardioPosition = new Map<CardioMachine, { pos: number; n: number }>();
  for (const [id, c] of count) freq.set(id, c / used);
  for (const [key, total] of sum) {
    const avg = total / n.get(key)!;
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "ex") position.set(id, avg);
    else if (kind === "group") groupPosition.set(id, avg);
    else cardioPosition.set(id as CardioMachine, { pos: avg, n: n.get(key)! });
  }
  return { count: used, freq, position, groupPosition, cardioPosition };
}

/** 自分で入力したメニューだけから読み取る（以前の動き） */
export function manualHabits(history: Workout[], today: string, opts: { maxSessions?: number; withinDays?: number } = {}): TrainingHabits {
  return trainingHabits(history, today, { maxSessions: 6, ...opts, onlyManual: true });
}

export interface CardioHabits {
  /** 見た回数（直近8週間・最大6回のトレーニング） */
  sessions: number;
  bike: number;
  treadmill: number;
}

/**
 * 日々の記録（自分で入力したメニュー・自動作成のメニューとも）で、バイク・トレッドミルを実際に行ったか
 * 完了にした、または実績を入れたものだけ数える（自動作成で入ったまま手を付けなかったものは数えない）
 */
export function cardioHabits(history: Workout[], today: string, opts: { maxSessions?: number; withinDays?: number } = {}): CardioHabits {
  const sessions = sortByDateDesc(history)
    .filter((w) => diffDays(today, w.trainingDate) < (opts.withinDays ?? 56))
    .slice(0, opts.maxSessions ?? 6);
  const did = (w: Workout, machine: CardioMachine) => w.cardio.some((c) => c.machine === machine && !c.skipped && (c.completed || (c.actual?.totalMin ?? 0) > 0));
  return { sessions: sessions.length, bike: sessions.filter((w) => did(w, "bike")).length, treadmill: sessions.filter((w) => did(w, "treadmill")).length };
}

/** 記録が2回以上あって一度も行っていない有酸素は、メニューに無理に入れない */
export function skipsCardio(h: CardioHabits, machine: CardioMachine): boolean {
  return h.sessions >= 2 && h[machine] === 0;
}
