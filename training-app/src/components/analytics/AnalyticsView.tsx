"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { listCompletedWorkouts } from "@/lib/db/repo";
import { exercisesInHistory, restDayCalendar, runTrend, storeStats, volumeTrend, weeklyCounts, weightTrend } from "@/lib/analytics";
import { formatJaDate, trainingDateOf } from "@/lib/date/trainingDay";
import { storeName, workoutStoreName } from "@/lib/catalog/stores";
import { useStores } from "@/hooks/useSettings";
import type { StoreId } from "@/lib/types";
import { AXIS, GRID, TOOLTIP_STYLE, storeColor } from "./chartTheme";

function useDark() {
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

const shortDate = (d: string) => formatJaDate(d, true).replace(/\(.\)/, "");

export function AnalyticsView() {
  const workouts = useLiveQuery(() => listCompletedWorkouts(), [], []);
  const dark = useDark();
  const registeredStores = useStores();
  const today = trainingDateOf();
  const exercises = useMemo(() => exercisesInHistory(workouts), [workouts]);
  const [exerciseId, setExerciseId] = useState<string>("");
  const selected = exerciseId || exercises[0]?.id || "";
  const [showTable, setShowTable] = useState(false);

  const trend = useMemo(() => weightTrend(workouts, selected), [workouts, selected]);
  const volume = useMemo(() => volumeTrend(workouts), [workouts]);
  const stores = useMemo(() => storeStats(workouts), [workouts]);
  const runs = useMemo(() => runTrend(workouts), [workouts]);
  const weeks = useMemo(() => weeklyCounts(workouts, 8, today), [workouts, today]);
  const calendar = useMemo(() => restDayCalendar(workouts, 28, today), [workouts, today]);

  // 店舗別に系列を分ける（別店舗・別マシンの重量は直接比較できないため）
  const trendByStore = useMemo(() => {
    const dates = [...new Set(trend.map((p) => p.date))];
    return dates.map((date) => {
      const row: Record<string, string | number | undefined> = { date };
      for (const p of trend.filter((x) => x.date === date)) {
        row[p.storeId] = p.workingWeight;
        row[`${p.storeId}_max`] = p.maxWeight;
        row[`${p.storeId}_e1rm`] = p.e1rm;
      }
      return row;
    });
  }, [trend]);
  // 記録に出てくる店舗（削除した店舗も記録時の名前で表示）
  const storeLabelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) if (!m.has(w.storeId)) m.set(w.storeId, workoutStoreName(w, true));
    return m;
  }, [workouts]);
  const storesInTrend = useMemo(() => [...new Set(trend.map((p) => p.storeId))].map((id) => ({ id, shortName: storeLabelOf.get(id) ?? storeName(id, true) })), [trend, storeLabelOf]);
  const legendStores = useMemo(() => {
    const ids = new Set(workouts.map((w) => w.storeId));
    return [...registeredStores.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, shortName: s.shortName })), ...[...ids].filter((id) => !registeredStores.some((s) => s.id === id)).map((id) => ({ id, shortName: storeLabelOf.get(id) ?? id }))];
  }, [workouts, registeredStores, storeLabelOf]);
  const hasE1rm = trend.some((p) => p.e1rm !== undefined);
  const isUnilateral = trend.some((p) => p.left !== undefined || p.right !== undefined);

  if (!workouts.length) return <p className="py-10 text-center text-muted">記録がまだありません</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">分析</h1>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} /> 表で見る
        </label>
      </header>

      {/* 休息日カレンダー */}
      <Card title="直近28日" sub={`トレーニング ${calendar.filter((d) => d.trained).length}日 ・ 休息 ${calendar.filter((d) => !d.trained).length}日`}>
        <div className="grid grid-cols-7 gap-1">
          {calendar.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-0.5" title={`${d.date}${d.storeId ? ` ${storeLabelOf.get(d.storeId) ?? storeName(d.storeId, true)}` : " 休息"}`}>
              <div className={`h-7 w-full rounded-md ${d.trained ? "" : "bg-card-2"} ${d.date === today ? "ring-2 ring-accent" : ""}`} style={d.trained && d.storeId ? { background: storeColor(d.storeId, dark) } : undefined} aria-label={`${d.date} ${d.trained ? "トレーニング" : "休息"}`} />
              <span className="text-[9px] text-muted">{d.date.slice(8)}</span>
            </div>
          ))}
        </div>
        <Legend items={legendStores.map((s) => ({ label: s.shortName, color: storeColor(s.id, dark) }))} />
      </Card>

      {/* 種目ごとの重量推移 */}
      <Card title="種目ごとの重量推移" sub="店舗ごとに系列を分けています（別マシンの重量は直接比較できません）。実線＝ワーキング重量">
        <select className="input mb-2 text-sm" value={selected} onChange={(e) => setExerciseId(e.target.value)} aria-label="種目を選択">
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{e.count}回）
            </option>
          ))}
        </select>
        {showTable ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th>日付</th>
                <th>店舗</th>
                <th>最大</th>
                <th>ワーキング</th>
                <th>セット</th>
                {hasE1rm && <th>推定1RM</th>}
                {isUnilateral && <th>左/右</th>}
              </tr>
            </thead>
            <tbody>
              {trend.map((p) => (
                <tr key={`${p.date}${p.storeId}`} className="border-t border-border tabular">
                  <td>{p.date}</td>
                  <td>{storeLabelOf.get(p.storeId) ?? storeName(p.storeId, true)}</td>
                  <td>{p.maxWeight}</td>
                  <td>{p.workingWeight}</td>
                  <td>{p.sets}</td>
                  {hasE1rm && <td>{p.e1rm ?? "—"}</td>}
                  {isUnilateral && <td>{p.left ?? "?"}/{p.right ?? "?"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={trendByStore} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} unit="" domain={["auto", "auto"]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => String(l)} formatter={(v, name) => [`${v} kg`, storeLabelOf.get(String(name)) ?? storeName(String(name), true)]} />
                {storesInTrend.map((s) => (
                  <Line key={s.id} type="monotone" dataKey={s.id} name={s.id} stroke={storeColor(s.id, dark)} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <Legend items={storesInTrend.map((s) => ({ label: s.shortName, color: storeColor(s.id, dark) }))} />
        {!hasE1rm && <p className="mt-1 text-[11px] text-muted">推定1RM は実回数が記録されたセットがある場合のみ計算します（取り込みデータには回数がないため未算出）。</p>}
      </Card>

      {/* 総セット数 */}
      <Card title="総セット数の変化" sub="1回のトレーニングあたりの完了セット数">
        {showTable ? (
          <SimpleTable rows={volume.map((v) => [v.date, storeLabelOf.get(v.storeId) ?? storeName(v.storeId, true), String(v.totalSets), String(v.exercises)])} head={["日付", "店舗", "セット", "種目"]} />
        ) : (
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={volume} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap={3}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} セット`, "合計"]} />
                <Bar dataKey="totalSets" radius={[4, 4, 0, 0]} isAnimationActive={false} shape={(props: unknown) => <StoreBar {...(props as StoreBarProps)} dark={dark} />} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* 週間 */}
      <Card title="週間トレーニング回数（直近8週）">
        <div className="h-36">
          <ResponsiveContainer>
            <BarChart data={weeks} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid {...GRID} vertical={false} />
              <XAxis dataKey="week" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [v, n === "count" ? "回数" : "セット"]} labelFormatter={(l) => `${l} の週`} />
              <Bar dataKey="count" fill={storeColor("ichijoji", dark)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 店舗別 */}
      <Card title="店舗別の記録">
        <ul className="space-y-1 text-sm">
          {stores.map((s) => (
            <li key={s.storeId} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: storeColor(s.storeId, dark) }} />
              <span className="flex-1">{storeName(s.storeId) !== s.storeId ? storeName(s.storeId) : (storeLabelOf.get(s.storeId) ?? "その他の店舗")}</span>
              <span className="tabular">{s.sessions}回</span>
              <span className="w-24 text-right text-xs text-muted">最終 {s.lastDate ? formatJaDate(s.lastDate) : "—"}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ランニング */}
      <Card title="ランニングの推移" sub="実績のみ（計画値は含めません）。走行時間(分)と速度(km/h)">
        {runs.length === 0 ? (
          <p className="text-sm text-muted">トレッドミルの実績がありません</p>
        ) : showTable ? (
          <SimpleTable head={["日付", "合計", "走行", "速度", "距離", "最長連続"]} rows={runs.map((r) => [r.date, r.totalMin !== undefined ? `${r.totalMin}分` : "—", r.runMin !== undefined ? `${r.runMin}分` : "—", r.speed !== undefined ? `${r.speed}` : "—", r.distanceKm !== undefined ? `${r.distanceKm}km` : "—", r.longestRunMin !== undefined ? `${r.longestRunMin}分` : "—"])} />
        ) : (
          <>
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={runs} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap={3}>
                  <CartesianGrid {...GRID} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v} 分`, n === "runMin" ? "ランニング" : "トレッドミル合計"]} />
                  <Bar dataKey="totalMin" name="totalMin" fill={dark ? "#199e70" : "#1baf7a"} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="runMin" name="runMin" fill={dark ? "#d95926" : "#eb6834"} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Legend items={[{ label: "合計(分)", color: dark ? "#199e70" : "#1baf7a" }, { label: "ランニング(分)", color: dark ? "#d95926" : "#eb6834" }]} />
            <div className="mt-2 h-36">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" type="category" tick={AXIS} tickFormatter={shortDate} axisLine={false} tickLine={false} allowDuplicatedCategory={false} />
                  <YAxis dataKey="speed" tick={AXIS} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                  <ZAxis range={[60, 60]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [n === "speed" ? `${v} km/h` : v, n === "speed" ? "速度" : "日付"]} />
                  <Scatter data={runs.filter((r) => r.speed !== undefined)} fill={dark ? "#3987e5" : "#2a78d6"} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted">速度(km/h)。距離は実績に無い場合「走行時間×速度」から推定しています。</p>
          </>
        )}
      </Card>
    </div>
  );
}

interface StoreBarProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: { storeId: StoreId };
  dark: boolean;
}
function StoreBar({ x, y, width, height, payload, dark }: StoreBarProps) {
  if (!height) return null;
  return <rect x={x} y={y} width={width} height={height} rx={4} fill={storeColor(payload.storeId, dark)} />;
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-3">
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="mb-2 text-[11px] text-muted">{sub}</p>}
      {children}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            {head.map((h) => (
              <th key={h} className="py-1 pr-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border tabular">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
