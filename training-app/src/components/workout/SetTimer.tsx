"use client";
import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, ResetIcon } from "@/components/ui/Icons";
import { useSettings } from "@/hooks/useSettings";
import { beep, vibrate } from "@/lib/timer/notify";

/**
 * 時間の種目（プランク・サイドプランクなど）のセット用タイマー
 * 押すと目標の秒数から数え、0 になったら音・振動で知らせてセットを完了にする
 */
export function SetTimer({ seconds, disabled, onDone }: { seconds: number | undefined; disabled?: boolean; onDone: () => void }) {
  const { settings } = useSettings();
  const total = seconds && seconds > 0 ? seconds : 0;
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const rest = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) {
        setRunning(false);
        setLeft(null);
        if (settings.sound) beep("finish");
        if (settings.vibration) vibrate([300, 100, 300]);
        doneRef.current();
      }
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, settings.sound, settings.vibration]);

  if (!total) return null;
  const shown = left ?? total;
  const start = () => {
    endAt.current = Date.now() + shown * 1000;
    // iOS は操作の中で一度音を鳴らしておかないと、後から鳴らせない
    if (settings.sound) beep("segment");
    setLeft(shown);
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setLeft(null);
  };
  const mm = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-1" data-testid="set-timer">
      <button
        type="button"
        className={`tap flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold tabular ${running ? "border-accent bg-accent text-white" : "border-border bg-card text-accent"}`}
        onClick={running ? pause : start}
        disabled={disabled}
        aria-label={running ? "タイマーを一時停止" : `${shown}秒のタイマーを開始`}
        data-testid="set-timer-toggle"
      >
        {running ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        {mm}
      </button>
      {left !== null && !running && (
        <button type="button" className="tap flex h-10 w-10 items-center justify-center rounded-xl text-muted" onClick={reset} aria-label="タイマーを戻す">
          <ResetIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
