"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { listCompletedWorkouts } from "@/lib/db/repo";
import { workoutStoreName } from "@/lib/catalog/stores";
import { useStores } from "@/hooks/useSettings";
import { formatJaDate, monthOf, trainingDateOf, weekStartOf, shiftYMD } from "@/lib/date/trainingDay";
import { countedSets } from "@/lib/planner/history";
import type { StoreId } from "@/lib/types";

export function HistoryList() {
  const workouts = useLiveQuery(() => listCompletedWorkouts(), [], []);
  const [store, setStore] = useState<StoreId | "all">("all");
  useStores();
  // 記録に出てくる店舗（削除した店舗・表示しない店舗も記録時の名前で）
  const stores = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) if (!m.has(w.storeId)) m.set(w.storeId, workoutStoreName(w, true));
    return [...m].map(([id, shortName]) => ({ id: id as StoreId, shortName }));
  }, [workouts]);
  const [view, setView] = useState<"list" | "week" | "month">("list");
  const today = trainingDateOf();
  const filtered = useMemo(() => workouts.filter((w) => store === "all" || w.storeId === store), [workouts, store]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const w of filtered) {
      const key = view === "week" ? weekStartOf(w.trainingDate) : view === "month" ? monthOf(w.trainingDate) : "all";
      m.set(key, [...(m.get(key) ?? []), w]);
    }
    return [...m.entries()];
  }, [filtered, view]);

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">履歴</h1>
        <span className="text-xs text-muted">{filtered.length}件</span>
      </header>
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          {(["list", "week", "month"] as const).map((v) => (
            <button key={v} type="button" className="chip px-3 py-1 text-xs" data-selected={view === v} onClick={() => setView(v)}>
              {v === "list" ? "一覧" : v === "week" ? "週間" : "月間"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button type="button" className="chip px-3 py-1 text-xs" data-selected={store === "all"} onClick={() => setStore("all")}>
            全店舗
          </button>
          {stores.map((s) => (
            <button key={s.id} type="button" className="chip px-3 py-1 text-xs" data-selected={store === s.id} onClick={() => setStore(s.id)}>
              {s.shortName}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 && <p className="py-10 text-center text-muted">記録がありません</p>}
      {grouped.map(([key, ws]) => (
        <section key={key} className="space-y-2">
          {view !== "list" && (
            <h2 className="pt-1 text-sm font-semibold text-muted">
              {view === "week" ? `${formatJaDate(key)} 〜 ${formatJaDate(shiftYMD(key, 6))}` : `${key.replace("-", "年")}月`} ・ {ws.length}回
            </h2>
          )}
          {ws.map((w) => {
            const sets = w.exercises.reduce((a, e) => a + countedSets(e).length, 0);
            // 実施した種目だけ数える（計画に入っていただけの種目は含めない）
            const doneEx = w.exercises.filter((e) => countedSets(e).length > 0);
            const tm = w.cardio.find((c) => c.machine === "treadmill");
            return (
              <Link key={w.id} href={`/history/${w.id}`} className="card block p-3" data-testid="history-item">
                <div className="flex items-baseline justify-between">
                  <div className="font-bold">
                    {formatJaDate(w.trainingDate)} <span className="text-sm font-normal text-muted">{w.trainingDate.slice(0, 4)}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {workoutStoreName(w, true)}{w.source === "import" && " ・ 取り込み"}
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {doneEx.length}種目・{sets}セット
                  {w.durations?.totalMin ? `・${w.durations.totalMin}分${w.durations.dumbbellMin ? `（ダンベル${w.durations.dumbbellMin}分）` : ""}` : ""}
                  {tm?.actual?.totalMin ? `・トレッドミル${tm.actual.totalMin}分${tm.actual.runMin ? `（走${tm.actual.runMin}分）` : ""}` : ""}
                  {w.trainingDate === today && <span className="ml-1 rounded bg-success-soft px-1 text-success">今日</span>}
                </div>
                <div className="mt-1 truncate text-sm">{(doneEx.length ? doneEx : w.exercises).map((e) => e.name.replace(/（.*）/, "")).join("・")}</div>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
