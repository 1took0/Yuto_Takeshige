"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Workout } from "@/lib/types";
import { getActiveWorkout, saveWorkout } from "@/lib/db/repo";

interface Ctx {
  workout: Workout | null;
  loading: boolean;
  /** 保存完了時刻 */
  savedAt: string | null;
  saving: boolean;
  /** 純粋関数で更新し、その都度保存する */
  mutate: (fn: (w: Workout) => Workout) => void;
  /** 新しいワークアウトを開始（既存の active は置き換え） */
  setWorkout: (w: Workout | null) => Promise<void>;
  reload: () => Promise<void>;
}

const ActiveWorkoutCtx = createContext<Ctx | null>(null);

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [workout, setState] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const latest = useRef<Workout | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const reload = useCallback(() => {
    return getActiveWorkout().then((w) => {
      latest.current = w ?? null;
      setState(w ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 他タブや再表示時の同期
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  const persist = useCallback((w: Workout) => {
    setSaving(true);
    queue.current = queue.current
      .then(() => saveWorkout(w))
      .then(() => {
        setSavedAt(new Date().toISOString());
      })
      .catch((e) => console.error("保存に失敗", e))
      .finally(() => setSaving(false));
  }, []);

  const mutate = useCallback(
    (fn: (w: Workout) => Workout) => {
      const cur = latest.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      latest.current = next;
      setState(next);
      persist(next);
    },
    [persist],
  );

  const setWorkout = useCallback(async (w: Workout | null) => {
    latest.current = w;
    setState(w);
    if (w) {
      await saveWorkout(w);
      setSavedAt(new Date().toISOString());
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ workout, loading, savedAt, saving, mutate, setWorkout, reload }), [workout, loading, savedAt, saving, mutate, setWorkout, reload]);
  return <ActiveWorkoutCtx.Provider value={value}>{children}</ActiveWorkoutCtx.Provider>;
}

export function useActiveWorkout(): Ctx {
  const ctx = useContext(ActiveWorkoutCtx);
  if (!ctx) throw new Error("ActiveWorkoutProvider が必要です");
  return ctx;
}
