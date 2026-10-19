import type { Workout } from "@/lib/types";
import { diffDays } from "@/lib/date/trainingDay";
import { countedSets, sortByDateDesc } from "./history";

/**
 * 自分で入力したメニュー（自動作成していない記録）から、よく行う種目と順番を読み取る
 * 自動作成のメニューで、その種目を選びやすくし、並び順もそれに合わせる
 */

export interface ManualHabits {
  /** 参考にした自分のメニューの回数 */
  count: number;
  /** 種目ごとの実施割合（0〜1。参考にした回数のうち何割で行ったか） */
  freq: Map<string, number>;
  /** 種目ごとの平均の位置（0=最初 〜 1=最後） */
  position: Map<string, number>;
}

/** 自分で入力したメニューか（以前の版で作った、ヒアリング無しの記録も含める） */
export function isManualWorkout(w: Workout): boolean {
  return w.manual === true || (!w.intake && w.source === "app");
}

export function manualHabits(history: Workout[], today: string, opts: { maxSessions?: number; withinDays?: number } = {}): ManualHabits {
  const maxSessions = opts.maxSessions ?? 6;
  const withinDays = opts.withinDays ?? 56;
  const sessions = sortByDateDesc(history)
    .filter((w) => isManualWorkout(w) && diffDays(today, w.trainingDate) < withinDays)
    .slice(0, maxSessions);
  const count = new Map<string, number>();
  const posSum = new Map<string, number>();
  let used = 0;
  for (const w of sessions) {
    const done = w.exercises.filter((e) => countedSets(e).length > 0);
    if (!done.length) continue;
    used++;
    done.forEach((e, i) => {
      count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
      posSum.set(e.exerciseId, (posSum.get(e.exerciseId) ?? 0) + (done.length === 1 ? 0.5 : i / (done.length - 1)));
    });
  }
  const freq = new Map<string, number>();
  const position = new Map<string, number>();
  for (const [id, n] of count) {
    freq.set(id, n / used);
    position.set(id, (posSum.get(id) ?? 0) / n);
  }
  return { count: used, freq, position };
}
