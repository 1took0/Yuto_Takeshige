"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as T from "@/lib/timer/engine";
import { beep, markNotifiedAndNotify } from "./timerNotify";

const PREFIX = "tc.timer.";

export function loadTimer(id: string): T.TimerState | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as T.TimerState) : null;
  } catch {
    return null;
  }
}
export function saveTimer(t: T.TimerState) {
  try {
    localStorage.setItem(PREFIX + t.id, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}
export function clearTimer(id: string) {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* ignore */
  }
}

/**
 * 永続化されるタイマー
 * - 状態は localStorage に保存。再表示時は保存済みの開始時刻から経過時間を再計算
 * - tick は 250ms。バックグラウンドで止まっても復帰時に正しい値になる
 */
export function useTimer(id: string, factory: () => T.TimerState, opts: { sound: boolean; vibration: boolean }) {
  const [state, setState] = useState<T.TimerState>(() => loadTimer(id) ?? factory());
  const [now, setNow] = useState(() => Date.now());
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  // id が変わったら読み直す（レンダー中に派生させる）
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setState(loadTimer(id) ?? factory());
  }

  useEffect(() => {
    saveTimer(state);
  }, [state]);

  useEffect(() => {
    const tick = () => {
      const n = Date.now();
      setNow(n);
      setState((s) => {
        const settled = T.settle(s, n);
        const r = T.shouldNotify(settled, n);
        if (r.notify) {
          markNotifiedAndNotify(r.finished ? "finish" : settled.segments[r.index]?.kind === "rest" ? "rest" : "segment", optsRef.current);
          return T.markNotified(settled, r.index);
        }
        return settled === s ? s : settled;
      });
    };
    const iv = setInterval(tick, 250);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const update = useCallback((fn: (s: T.TimerState, now: number) => T.TimerState) => setState((s) => fn(s, Date.now())), []);
  const replace = useCallback((t: T.TimerState) => setState(t), []);

  return {
    state,
    view: T.view(state, now),
    start: () => update(T.start),
    pause: () => update(T.pause),
    resume: () => update(T.resume),
    toggle: () => update(T.toggle),
    reset: () => update(T.reset),
    skip: () => update(T.skipToNext),
    adjust: (d: number) => update((s, n) => T.adjustCurrentSegment(s, d, n)),
    replace,
    testBeep: () => beep("segment"),
  };
}
