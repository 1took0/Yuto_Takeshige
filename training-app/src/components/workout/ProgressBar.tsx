"use client";
import type { Progress } from "@/lib/workout/edit";
import { formatMinutes } from "@/lib/date/trainingDay";

export function ProgressBar({ p, compact }: { p: Progress; compact?: boolean }) {
  return (
    <div className="card p-3" data-testid="progress">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xs text-muted">完了セット</div>
          <div className="text-2xl font-bold tabular">
            {p.doneSets}
            <span className="text-base text-muted"> / {p.plannedSets}</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted">
          <div>
            種目 <b className="text-fg tabular">{p.doneExercises}</b>/{p.totalExercises} 完了・残り <b className="text-fg tabular">{p.remainingExercises}</b>
          </div>
          <div>
            推定残り <b className="text-fg tabular">{formatMinutes(Math.ceil(p.estRemainingSec / 60))}</b>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-card-2" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${p.percent}%` }} />
        </div>
      )}
    </div>
  );
}
