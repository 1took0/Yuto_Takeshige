"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { shareApi } from "@/lib/share/client";
import type { PublicUser } from "@/lib/share/service";
import type { SharedWorkout } from "@/lib/share/sanitize";
import { formatJaDate, trainingDateOf } from "@/lib/date/trainingDay";
import { formatDurations } from "@/lib/workout/duration";
import { PersonCalendar, SessionBar, StoreLegend, storeLabel, useDarkTheme } from "./ActivityViz";

/** 共有している利用者の記録（いつ・どこで・どれくらい。種目の内容は共有しない） */
export function UserRecords({ userId }: { userId: string }) {
  const [data, setData] = useState<{ user: PublicUser; workouts: SharedWorkout[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useDarkTheme();
  const today = trainingDateOf();

  useEffect(() => {
    shareApi
      .user(userId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました"));
  }, [userId]);

  const stores = new Map<string, string | undefined>();
  for (const w of data?.workouts ?? []) if (!stores.has(w.storeId)) stores.set(w.storeId, w.storeLabel);
  const week = data?.user.week;

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
      {data && (
        <>
          <section className="grid grid-cols-3 gap-2 text-center">
            <Stat label="合計" value={`${data.user.workoutCount}回`} />
            <Stat label="直近7日" value={`${week?.sessions ?? 0}回`} />
            <Stat label="直近7日の時間" value={week?.totalMin ? `${week.totalMin}分` : "—"} />
          </section>
          <section className="card p-3">
            <h2 className="mb-2 font-semibold">直近28日</h2>
            <PersonCalendar days={data.user.days ?? []} today={today} />
            <StoreLegend stores={[...stores.entries()]} dark={dark} />
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">トレーニング</h2>
            {data.workouts.length === 0 && <p className="text-sm text-muted">共有された記録はまだありません。</p>}
            {data.workouts.map((w) => (
              <div key={w.id} className="card p-3" data-testid="user-workout">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {formatJaDate(w.trainingDate)} <span className="text-xs font-normal text-muted">{w.trainingDate.slice(0, 4)}</span>
                  </span>
                  <span className="text-xs text-muted">{storeLabel(w.storeId, w.storeLabel)}</span>
                </div>
                <SessionBar w={w} />
                {w.durations?.totalMin ? <div className="mt-1 text-[11px] text-muted">{formatDurations(w.durations)}</div> : null}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-lg font-bold tabular">{value}</div>
    </div>
  );
}
