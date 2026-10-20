"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActivityDay, PublicUser } from "@/lib/share/service";
import type { SharedWorkout } from "@/lib/share/sanitize";
import { storeColor } from "@/components/analytics/chartTheme";
import { allStores, isBuiltinStore, shortNameOf, storeName } from "@/lib/catalog/stores";
import { formatJaDate, shiftYMD } from "@/lib/date/trainingDay";

/**
 * みんなの記録の可視化（誰が・いつ・どこで・どれくらい）
 * - 色＝店舗、濃さ・長さ＝トレーニング量（時間。時間の記録が無ければセット数）
 */

export function useDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const upd = () => setDark(el.dataset.theme === "dark");
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** 店舗名（自分の端末に無い店舗は、記録に添えられた名前） */
export function storeLabel(storeId: string, label: string | undefined, short = true): string {
  const known = isBuiltinStore(storeId) || allStores().some((s) => s.id === storeId);
  if (known) return storeName(storeId, short);
  if (!label) return "その他の店舗";
  return short ? shortNameOf(label) : label;
}

/** 量（0〜1）：90分または24セットで最大 */
export function amountOf(totalMin: number | undefined, setCount: number): number {
  if (totalMin) return Math.min(1, totalMin / 90);
  return Math.min(1, setCount / 24);
}

export function amountText(totalMin: number | undefined, setCount: number, sessions = 1): string {
  const parts = [totalMin ? `${totalMin}分` : "", setCount ? `${setCount}セット` : "", sessions > 1 ? `${sessions}回` : ""].filter(Boolean);
  return parts.join("・") || "記録あり";
}

function dayTitle(d: ActivityDay): string {
  return `${formatJaDate(d.date)} ${storeLabel(d.storeId, d.storeLabel)} ${amountText(d.totalMin, d.setCount, d.sessions)}`;
}

/** 全員の直近N日を1行ずつ並べた表 */
export function ActivityGrid({ users, myId, today, days = 14 }: { users: PublicUser[]; myId?: string; today: string; days?: number }) {
  const dark = useDarkTheme();
  const dates = Array.from({ length: days }, (_, i) => shiftYMD(today, i - days + 1));
  const storesSeen = new Map<string, string | undefined>();
  for (const u of users) for (const d of u.days ?? []) if (dates.includes(d.date) && !storesSeen.has(d.storeId)) storesSeen.set(d.storeId, d.storeLabel);
  return (
    <div data-testid="activity-grid">
      <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: `4.5rem repeat(${days}, minmax(0, 1fr))` }}>
        <span />
        {dates.map((d) => (
          <span key={d} className={`text-center text-[9px] tabular ${d === today ? "font-bold text-accent" : "text-muted"}`}>
            {Number(d.slice(8))}
          </span>
        ))}
        {users.map((u) => {
          const byDate = new Map((u.days ?? []).map((d) => [d.date, d]));
          return (
            <div key={u.userId} className="contents" data-testid="activity-row">
              <Link href={`/community/${u.userId}`} className="truncate pr-1 text-xs font-semibold">
                {u.displayName}
                {u.userId === myId && <span className="font-normal text-muted">（自分）</span>}
              </Link>
              {dates.map((date) => {
                const d = byDate.get(date);
                return d ? (
                  <span
                    key={date}
                    className={`aspect-square rounded-[4px] ${date === today ? "ring-2 ring-accent" : ""}`}
                    style={{ background: storeColor(d.storeId, dark), opacity: 0.35 + 0.65 * amountOf(d.totalMin, d.setCount) }}
                    title={dayTitle(d)}
                    aria-label={`${u.displayName} ${dayTitle(d)}`}
                    data-testid="activity-cell"
                  />
                ) : (
                  <span key={date} className={`aspect-square rounded-[4px] bg-card-2 ${date === today ? "ring-2 ring-accent" : ""}`} aria-label={`${u.displayName} ${formatJaDate(date)} 休み`} />
                );
              })}
            </div>
          );
        })}
      </div>
      <StoreLegend stores={[...storesSeen.entries()]} dark={dark} />
      <p className="mt-1 text-[11px] text-muted">色＝店舗、濃いほど長い（時間の記録が無い日はセット数）。マスをタップ長押しで詳細。</p>
    </div>
  );
}

export function StoreLegend({ stores, dark }: { stores: [string, string | undefined][]; dark: boolean }) {
  if (!stores.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      {stores.map(([id, label]) => (
        <span key={id} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: storeColor(id, dark) }} />
          {storeLabel(id, label)}
        </span>
      ))}
    </div>
  );
}

/** 1回分のトレーニング量を横棒で（長さ＝時間。120分で最大） */
export function SessionBar({ w }: { w: SharedWorkout }) {
  const dark = useDarkTheme();
  const total = w.durations?.totalMin;
  const ratio = total ? Math.min(1, total / 120) : Math.min(1, w.setCount / 30);
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-card-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, ratio * 100)}%`, background: storeColor(w.storeId, dark) }} />
      </div>
      <span className="w-28 shrink-0 text-right text-xs tabular" data-testid="session-amount">
        {amountText(total, w.setCount)}
      </span>
    </div>
  );
}

/** その人の直近28日のカレンダー */
export function PersonCalendar({ days, today }: { days: ActivityDay[]; today: string }) {
  const dark = useDarkTheme();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const dates = Array.from({ length: 28 }, (_, i) => shiftYMD(today, i - 27));
  return (
    <div className="grid grid-cols-7 gap-1" data-testid="person-calendar">
      {dates.map((date) => {
        const d = byDate.get(date);
        return (
          <div key={date} className="flex flex-col items-center gap-0.5">
            <div
              className={`h-7 w-full rounded-md ${d ? "" : "bg-card-2"} ${date === today ? "ring-2 ring-accent" : ""}`}
              style={d ? { background: storeColor(d.storeId, dark), opacity: 0.35 + 0.65 * amountOf(d.totalMin, d.setCount) } : undefined}
              title={d ? dayTitle(d) : `${formatJaDate(date)} 休み`}
              aria-label={d ? dayTitle(d) : `${formatJaDate(date)} 休み`}
            />
            <span className="text-[9px] text-muted">{Number(date.slice(8))}</span>
          </div>
        );
      })}
    </div>
  );
}
