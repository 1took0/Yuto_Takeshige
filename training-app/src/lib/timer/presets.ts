import type { TimerSegment } from "./engine";
import { newId } from "@/lib/id";
import { formatDuration } from "@/lib/date/trainingDay";

export type TimerType = "interval" | "countdown" | "bike" | "treadmill";

export const TIMER_TYPE_LABEL: Record<TimerType, string> = {
  interval: "インターバル",
  countdown: "タイマー",
  bike: "バイク",
  treadmill: "トレッドミル",
};

export interface IntervalConfig {
  /** 開始前の準備（秒）。0 なら無し */
  prepSec: number;
  workSec: number;
  restSec: number;
  rounds: number;
}

/** インターバル：準備 →（運動 → 休憩）× 回数。最後の休憩は省く */
export function buildInterval(c: IntervalConfig): TimerSegment[] {
  const segs: TimerSegment[] = [];
  const rounds = Math.max(1, Math.min(99, Math.round(c.rounds)));
  if (c.prepSec > 0) segs.push({ id: newId("seg"), label: "準備", kind: "warmup", durationSec: Math.round(c.prepSec) });
  for (let i = 1; i <= rounds; i++) {
    segs.push({ id: newId("seg"), label: `運動 ${i}/${rounds}`, kind: "work", durationSec: Math.max(1, Math.round(c.workSec)) });
    if (i < rounds && c.restSec > 0) segs.push({ id: newId("seg"), label: `休憩 ${i}/${rounds}`, kind: "rest", durationSec: Math.round(c.restSec) });
  }
  return segs;
}

/** 通常のタイマー（1区間） */
export function buildCountdown(totalSec: number): TimerSegment[] {
  return [{ id: newId("seg"), label: "タイマー", kind: "rest", durationSec: Math.max(1, Math.round(totalSec)) }];
}

function secLabel(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  return sec % 60 === 0 ? `${sec / 60}分` : formatDuration(sec);
}

/** 区間から自動で名前を作る */
export function autoTitle(type: TimerType, segs: TimerSegment[]): string {
  const total = segs.reduce((a, s) => a + s.durationSec, 0);
  if (type === "countdown") return `タイマー ${formatDuration(total)}`;
  if (type === "interval") {
    const work = segs.filter((s) => s.kind === "work");
    const rest = segs.find((s) => s.kind === "rest");
    if (work.length) return `運動${secLabel(work[0].durationSec)}${rest ? `／休憩${secLabel(rest.durationSec)}` : ""} ×${work.length}`;
    return `インターバル ${formatDuration(total)}`;
  }
  if (type === "bike") return `バイク ${Math.round(total / 60)}分`;
  const run = segs.filter((s) => s.kind === "run").reduce((a, s) => a + s.durationSec, 0);
  return `トレッドミル ${Math.round(total / 60)}分${run ? `（ラン${Math.round(run / 60)}分）` : ""}`;
}

/** インターバルの区間から設定を読み戻す（履歴から呼び出したとき編集欄に反映するため） */
export function parseInterval(segs: TimerSegment[]): IntervalConfig | null {
  const work = segs.filter((s) => s.kind === "work");
  if (!work.length) return null;
  const rest = segs.find((s) => s.kind === "rest");
  const prep = segs.find((s) => s.kind === "warmup");
  return { prepSec: prep?.durationSec ?? 0, workSec: work[0].durationSec, restSec: rest?.durationSec ?? 0, rounds: work.length };
}

// ---------- 履歴 ----------
export interface TimerHistoryEntry {
  id: string;
  type: TimerType;
  title: string;
  /** 区間（id は呼び出し時に振り直す） */
  segments: Omit<TimerSegment, "id">[];
  lastUsedAt: string;
  useCount: number;
}

export const MAX_HISTORY = 30;

function signature(type: TimerType, segs: Omit<TimerSegment, "id">[]): string {
  return `${type}|${segs.map((s) => `${s.kind}:${s.durationSec}:${s.speedKmh ?? ""}:${s.inclinePct ?? ""}:${s.level ?? ""}`).join(",")}`;
}

/** 使用したタイマーを履歴に加える（同じ設定は1件にまとめて先頭へ） */
export function addToHistory(list: TimerHistoryEntry[], type: TimerType, segments: TimerSegment[], title?: string, now = new Date().toISOString()): TimerHistoryEntry[] {
  const segs = segments.map(({ id: _id, ...rest }) => {
    void _id;
    return rest;
  });
  const sig = signature(type, segs);
  const existing = list.find((e) => signature(e.type, e.segments) === sig);
  const entry: TimerHistoryEntry = existing
    ? { ...existing, title: title?.trim() || existing.title, lastUsedAt: now, useCount: existing.useCount + 1 }
    : { id: newId("th"), type, title: title?.trim() || autoTitle(type, segments), segments: segs, lastUsedAt: now, useCount: 1 };
  return [entry, ...list.filter((e) => e !== existing)].slice(0, MAX_HISTORY);
}

export function historySegments(e: TimerHistoryEntry): TimerSegment[] {
  return e.segments.map((s) => ({ ...s, id: newId("seg") }));
}
