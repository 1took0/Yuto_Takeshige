"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { shareApi } from "@/lib/share/client";
import type { PublicUser } from "@/lib/share/service";
import type { SharedWorkout } from "@/lib/share/sanitize";
import type { Workout } from "@/lib/types";
import { storeName } from "@/lib/catalog/stores";
import { formatJaDate } from "@/lib/date/trainingDay";
import { countedSets } from "@/lib/planner/history";
import { ReadOnlyView } from "@/components/history/WorkoutDetail";

/** 共有している利用者の記録一覧（閲覧のみ） */
export function UserRecords({ userId }: { userId: string }) {
  const [data, setData] = useState<{ user: PublicUser; workouts: SharedWorkout[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    shareApi
      .user(userId)
      .then((d) => {
        setData(d);
        const hash = window.location.hash.slice(1);
        setOpen(hash || d.workouts[0]?.id || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました"));
  }, [userId]);

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <Link href="/community" className="btn-ghost -ml-3 px-3" aria-label="みんなの記録へ戻る">
          ←
        </Link>
        <h1 className="truncate text-xl font-bold">{data ? `${data.user.displayName} さんの記録` : "記録"}</h1>
      </header>
      {error && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-muted">読み込み中…</p>}
      {data && data.workouts.length === 0 && <p className="text-sm text-muted">共有された記録はまだありません。</p>}
      {data?.workouts.map((sw) => {
        const w = sw as unknown as Workout;
        const isOpen = open === w.id;
        const sets = w.exercises.reduce((a, e) => a + countedSets(e).length, 0);
        return (
          <section key={w.id} id={w.id} className="space-y-2">
            <button type="button" className="card flex w-full items-baseline justify-between p-3 text-left" onClick={() => setOpen(isOpen ? null : w.id)} aria-expanded={isOpen} data-testid="user-workout">
              <span className="font-semibold">
                {formatJaDate(w.trainingDate)} <span className="text-xs font-normal text-muted">{w.trainingDate.slice(0, 4)}</span>
              </span>
              <span className="text-xs text-muted">
                {storeName(w.storeId, true)} ・ {w.exercises.length}種目 {sets}セット {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div className="pl-2">
                {w.notes && <p className="mb-2 rounded-xl bg-card-2 p-2 text-sm">{w.notes}</p>}
                <ReadOnlyView w={w} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
