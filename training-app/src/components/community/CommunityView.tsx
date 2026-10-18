"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { shareApi } from "@/lib/share/client";
import type { FeedItem, PublicUser } from "@/lib/share/service";
import { storeName } from "@/lib/catalog/stores";
import { diffDays, formatJaDate, trainingDateOf } from "@/lib/date/trainingDay";
import { countedSets } from "@/lib/planner/history";
import type { Workout } from "@/lib/types";

/** みんなの記録（共有している利用者のみ） */
export function CommunityView() {
  const { settings } = useSettings();
  const [data, setData] = useState<{ users: PublicUser[]; recent: FeedItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const today = trainingDateOf();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await shareApi.status();
      if (!st.enabled) {
        setDisabledReason(st.reason ?? "共有機能は利用できません");
        return;
      }
      setData(await shareApi.feed());
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const myId = settings.profile?.userId;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">みんなの記録</h1>
        <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={load} disabled={loading}>
          {loading ? "読み込み中…" : "↻ 更新"}
        </button>
      </header>

      {!settings.sharing && !disabledReason && (
        <div className="rounded-xl bg-card-2 p-3 text-sm text-muted">
          あなたの記録は共有されていません。共有すると、ここに表示されます。
          <Link href="/settings#share" className="ml-1 text-accent">
            設定で共有する →
          </Link>
        </div>
      )}
      {disabledReason && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">{disabledReason}</p>}
      {error && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      {data && (
        <>
          <section className="card p-3">
            <h2 className="mb-2 font-semibold">共有している人（{data.users.length}人）</h2>
            {data.users.length === 0 && <p className="text-sm text-muted">まだ誰も共有していません。</p>}
            <ul className="divide-y divide-border">
              {data.users.map((u) => (
                <li key={u.userId}>
                  <Link href={`/community/${u.userId}`} className="tap flex items-center gap-3 py-2" data-testid="community-user">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent">{u.displayName.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {u.displayName}
                        {u.userId === myId && <span className="ml-1 text-xs font-normal text-muted">（あなた）</span>}
                      </span>
                      <span className="block text-xs text-muted">
                        {u.workoutCount}回 ・ 最終 {u.lastDate ? `${formatJaDate(u.lastDate)}（${diffDays(today, u.lastDate)}日前）` : "—"}
                      </span>
                    </span>
                    <span className="text-muted">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">最近のトレーニング</h2>
            {data.recent.length === 0 && <p className="text-sm text-muted">共有された記録はまだありません。</p>}
            {data.recent.map((it) => (
              <FeedCard key={`${it.userId}:${it.workout.id}`} item={it} isMe={it.userId === myId} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function FeedCard({ item, isMe }: { item: FeedItem; isMe: boolean }) {
  const w = item.workout as unknown as Workout;
  const sets = w.exercises.reduce((a, e) => a + countedSets(e).length, 0);
  const tm = w.cardio.find((c) => c.machine === "treadmill" && c.completed);
  return (
    <Link href={`/community/${item.userId}#${w.id}`} className="card block p-3" data-testid="feed-item">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">
          {item.displayName}
          {isMe && <span className="ml-1 text-xs font-normal text-muted">（あなた）</span>}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {formatJaDate(w.trainingDate)} ・ {storeName(w.storeId, true)}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted">
        {w.exercises.filter((e) => countedSets(e).length).length}種目・{sets}セット
        {tm?.actual?.runMin ? `・ラン${tm.actual.runMin}分${tm.actual.runSpeedKmh ? `（${tm.actual.runSpeedKmh}km/h）` : ""}` : tm?.actual?.totalMin ? `・トレッドミル${tm.actual.totalMin}分` : ""}
      </div>
      <div className="mt-1 truncate text-sm">
        {w.exercises
          .filter((e) => countedSets(e).length)
          .map((e) => e.name.replace(/（.*）/, ""))
          .join("・")}
      </div>
    </Link>
  );
}
