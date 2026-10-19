"use client";
import { useEffect } from "react";
import { useTimer } from "@/hooks/useTimer";
import { restTimer } from "@/lib/timer/engine";
import { formatDuration } from "@/lib/date/trainingDay";
import { unlockAudio } from "@/lib/timer/notify";

/** セット間休憩タイマー（画面下部に固定表示） */
export function RestTimerBar({ seconds, nonce, sound, vibration, onClose }: { seconds: number; nonce: number; sound: boolean; vibration: boolean; onClose: () => void }) {
  const id = "rest";
  const t = useTimer(id, () => restTimer(id, seconds), { sound, vibration });
  useEffect(() => {
    unlockAudio();
    const fresh = restTimer(id, seconds);
    t.replace({ ...fresh, status: "running", startedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, seconds]);

  const v = t.view;
  const pct = v.totalSec ? Math.min(100, (v.elapsedSec / v.totalSec) * 100) : 0;
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 mx-auto max-w-lg px-3" data-testid="rest-timer">
      <div className={`card flex items-center gap-3 p-2 shadow-lg ${v.finished ? "ring-2 ring-success" : ""}`}>
        <div className="relative h-12 w-12 shrink-0">
          <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
            <circle cx="18" cy="18" r="16" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle cx="18" cy="18" r="16" fill="none" stroke={v.finished ? "var(--success)" : "var(--accent)"} strokeWidth="3" strokeDasharray={`${pct} 100`} pathLength={100} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">{v.finished ? "休憩終了！次のセットへ" : "休憩中"}</div>
          <div className="text-2xl font-bold tabular">{formatDuration(v.remainingSec)}</div>
        </div>
        <button type="button" className="btn-secondary px-2.5" onClick={() => t.adjust(-10)} aria-label="10秒短くする" disabled={v.finished}>
          −10
        </button>
        <button type="button" className="btn-secondary px-2.5" onClick={() => t.adjust(10)} aria-label="10秒延長">
          +10
        </button>
        <button type="button" className="btn-secondary px-3" onClick={t.toggle} aria-label={t.state.status === "running" ? "一時停止" : "再開"}>
          {t.state.status === "running" ? "❚❚" : "▶"}
        </button>
        <button type="button" className="btn-ghost px-3" onClick={onClose} aria-label="休憩タイマーを閉じる">
          ✕
        </button>
      </div>
    </div>
  );
}
