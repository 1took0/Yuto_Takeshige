/**
 * タイムスタンプ基準のインターバルタイマー
 * - 経過時間は「蓄積ミリ秒 + (now - startedAt)」で計算するため、
 *   画面スリープやタブ切替後に再表示しても正しい時間に復元できる
 * - 状態は JSON シリアライズ可能で、そのまま localStorage に保存できる
 */
import type { SegmentKind } from "@/lib/types";

export interface TimerSegment {
  id: string;
  label: string;
  kind: SegmentKind | "rest" | "work";
  durationSec: number;
  speedKmh?: number;
  speedMaxKmh?: number;
  inclinePct?: number;
  level?: number;
}

export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerState {
  id: string;
  title: string;
  segments: TimerSegment[];
  status: TimerStatus;
  /** 現在の走行開始時刻(epoch ms)。running のときのみ */
  startedAt?: number;
  /** 一時停止までに蓄積した経過ミリ秒 */
  accumulatedMs: number;
  /** 区間切替通知を出した区間インデックス（重複通知防止） */
  notifiedIndex: number;
  updatedAt: number;
}

export function createTimer(id: string, title: string, segments: TimerSegment[]): TimerState {
  return { id, title, segments, status: "idle", accumulatedMs: 0, notifiedIndex: -1, updatedAt: Date.now() };
}

export function totalSec(t: Pick<TimerState, "segments">): number {
  return t.segments.reduce((a, s) => a + s.durationSec, 0);
}

export function elapsedMs(t: TimerState, now = Date.now()): number {
  const base = t.accumulatedMs + (t.status === "running" && t.startedAt !== undefined ? Math.max(0, now - t.startedAt) : 0);
  return Math.min(base, totalSec(t) * 1000);
}

export function start(t: TimerState, now = Date.now()): TimerState {
  if (t.status === "running") return t;
  if (t.status === "finished") return t;
  return { ...t, status: "running", startedAt: now, updatedAt: now };
}

export function pause(t: TimerState, now = Date.now()): TimerState {
  if (t.status !== "running") return t;
  return { ...t, status: "paused", accumulatedMs: elapsedMs(t, now), startedAt: undefined, updatedAt: now };
}

export function resume(t: TimerState, now = Date.now()): TimerState {
  if (t.status !== "paused") return t;
  return { ...t, status: "running", startedAt: now, updatedAt: now };
}

export function reset(t: TimerState, now = Date.now()): TimerState {
  return { ...t, status: "idle", accumulatedMs: 0, startedAt: undefined, notifiedIndex: -1, updatedAt: now };
}

export function toggle(t: TimerState, now = Date.now()): TimerState {
  if (t.status === "running") return pause(t, now);
  if (t.status === "paused") return resume(t, now);
  if (t.status === "idle") return start(t, now);
  return t;
}

export interface TimerView {
  elapsedSec: number;
  remainingSec: number;
  totalSec: number;
  index: number; // 現在区間（finished のときは最後の区間）
  segment: TimerSegment | undefined;
  segmentElapsedSec: number;
  segmentRemainingSec: number;
  next: TimerSegment | undefined;
  finished: boolean;
  progress: number; // 0-1
}

export function view(t: TimerState, now = Date.now()): TimerView {
  const total = totalSec(t);
  const elapsedSecRaw = elapsedMs(t, now) / 1000;
  const elapsedSec = Math.min(elapsedSecRaw, total);
  let acc = 0;
  let index = t.segments.length - 1;
  for (let i = 0; i < t.segments.length; i++) {
    const d = t.segments[i].durationSec;
    if (elapsedSec < acc + d) {
      index = i;
      break;
    }
    acc += d;
  }
  const finished = total > 0 && elapsedSec >= total;
  if (finished) {
    acc = total - (t.segments[index]?.durationSec ?? 0);
  }
  const segment = t.segments[index];
  const segElapsed = Math.max(0, elapsedSec - acc);
  return {
    elapsedSec,
    remainingSec: Math.max(0, total - elapsedSec),
    totalSec: total,
    index,
    segment,
    segmentElapsedSec: segElapsed,
    segmentRemainingSec: Math.max(0, (segment?.durationSec ?? 0) - segElapsed),
    next: t.segments[index + 1],
    finished,
    progress: total ? elapsedSec / total : 0,
  };
}

/** 時間経過で finished に遷移させる（tick から呼ぶ） */
export function settle(t: TimerState, now = Date.now()): TimerState {
  if (t.status === "running" && elapsedMs(t, now) >= totalSec(t) * 1000) {
    return { ...t, status: "finished", accumulatedMs: totalSec(t) * 1000, startedAt: undefined, updatedAt: now };
  }
  return t;
}

/** 次の区間の先頭へスキップ */
export function skipToNext(t: TimerState, now = Date.now()): TimerState {
  const v = view(t, now);
  if (v.finished) return t;
  let acc = 0;
  for (let i = 0; i <= v.index; i++) acc += t.segments[i].durationSec;
  const ms = acc * 1000;
  const base = { ...t, accumulatedMs: ms, updatedAt: now };
  if (ms >= totalSec(t) * 1000) return { ...base, status: "finished", startedAt: undefined };
  return t.status === "running" ? { ...base, startedAt: now } : base;
}

/** 現在区間に秒数を加減する（休憩タイマーの +30秒 など） */
export function adjustCurrentSegment(t: TimerState, deltaSec: number, now = Date.now()): TimerState {
  const v = view(t, now);
  const seg = t.segments[v.index];
  if (!seg) return t;
  const minDuration = Math.ceil(v.segmentElapsedSec) + 1;
  const duration = Math.max(minDuration, seg.durationSec + deltaSec);
  const segments = t.segments.map((s, i) => (i === v.index ? { ...s, durationSec: duration } : s));
  return { ...t, segments, status: t.status === "finished" ? "paused" : t.status, updatedAt: now };
}

/** 区間切替の通知が必要か（index が前回通知より進んだ、または終了） */
export function shouldNotify(t: TimerState, now = Date.now()): { notify: boolean; index: number; finished: boolean } {
  const v = view(t, now);
  if (t.status !== "running" && !v.finished) return { notify: false, index: v.index, finished: false };
  const idx = v.finished ? t.segments.length : v.index;
  return { notify: idx > t.notifiedIndex && (idx > 0 || v.finished), index: idx, finished: v.finished };
}

export function markNotified(t: TimerState, index: number): TimerState {
  return { ...t, notifiedIndex: index };
}

export function restTimer(id: string, seconds: number): TimerState {
  return createTimer(id, "休憩", [{ id: `${id}_rest`, label: "休憩", kind: "rest", durationSec: seconds }]);
}
