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
  /** バイク・トレッドミルをどこで行うか（両方行った日の多数決：筋トレの前／途中／後） */
  cardioPlace: Map<CardioMachine, "first" | "middle" | "last">;
  /** 種目の前後関係：before.get(a).get(b) = a と b を両方行った日のうち a が先だった回数 */
  before: Map<string, Map<string, number>>;
  /** both.get(a).get(b) = a と b を両方行った日の数 */
  both: Map<string, Map<string, number>>;
}

/**
 * a を b より前に置くべきか（両方行った日の多数決）。どちらとも言えないときは 0
 * 1回だけ順番が違った日に引きずられないよう、平均の位置ではなく「どちらが先だった回数」で決める
 */
export function precedes(h: TrainingHabits, a: string, b: string): -1 | 0 | 1 {
  const n = h.both.get(a)?.get(b) ?? 0;
  if (n === 0) return 0;
  const ab = h.before.get(a)?.get(b) ?? 0;
  if (ab * 2 > n) return 1;
  if (ab * 2 < n) return -1;
  return 0;
}

/**
 * 候補を本人の習慣の順に並べる
 * まず fallback（平均の位置や標準の順）で並べ、隣り合う2つの前後関係が記録の多数決と逆なら入れ替える
 * （前後関係が分からない組は fallback のまま）
 */
export function sortByHabits<T>(items: T[], h: TrainingHabits, idOf: (x: T) => string, fallback: (x: T) => number): T[] {
  const out = [...items].sort((a, b) => fallback(a) - fallback(b));
  for (let pass = 0; pass < out.length; pass++) {
    let swapped = false;
    for (let i = 0; i + 1 < out.length; i++) {
      if (precedes(h, idOf(out[i + 1]), idOf(out[i])) === 1) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return out;
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
  const before = new Map<string, Map<string, number>>();
  const both = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, Map<string, number>>, a: string, b: string) => {
    const row = m.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + 1);
    m.set(a, row);
  };
  const place = new Map<CardioMachine, { first: number; middle: number; last: number }>();
  let used = 0;
  for (const w of sessions) {
    const done = doneOrder(w);
    if (!done.some((d) => d.kind === "exercise")) continue;
    used++;
    // 種目どうしの前後関係（同じ日に同じ種目が2回あれば最初の位置）
    const firstIdx = new Map<string, number>();
    done.forEach((d, i) => d.kind === "exercise" && !firstIdx.has(d.exerciseId) && firstIdx.set(d.exerciseId, i));
    const ids = [...firstIdx.keys()];
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      bump(both, a, b);
      if (firstIdx.get(a)! < firstIdx.get(b)!) bump(before, a, b);
    }
    // 有酸素の位置：筋トレの前（最初の種目より前）／後（最後の種目より後）／途中
    const exIdx = done.map((d, i) => (d.kind === "exercise" ? i : -1)).filter((i) => i >= 0);
    done.forEach((d, i) => {
      if (d.kind !== "cardio") return;
      const p = place.get(d.machine) ?? { first: 0, middle: 0, last: 0 };
      p[i < exIdx[0] ? "first" : i > exIdx[exIdx.length - 1] ? "last" : "middle"]++;
      place.set(d.machine, p);
    });
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
  const cardioPlace = new Map<CardioMachine, "first" | "middle" | "last">();
  for (const [m, p] of place) cardioPlace.set(m, p.first >= p.last && p.first >= p.middle ? "first" : p.last >= p.middle ? "last" : "middle");
  return { count: used, freq, position, groupPosition, cardioPosition, cardioPlace, before, both };
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
