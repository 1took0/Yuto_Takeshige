"use client";
import Link from "next/link";
import { useState } from "react";
import type { CardioEntry, CardioSegment, Workout } from "@/lib/types";
import { NumberField } from "@/components/ui/NumberField";
import { formatDuration } from "@/lib/date/trainingDay";
import { planDistanceKm, planRunMin, planTotalMin } from "@/lib/planner/cardio";

interface Props {
  entry: CardioEntry;
  mutate: (fn: (w: Workout) => Workout) => void;
  /** タイマーへのリンクを出す（アクティブ時） */
  timerLink?: boolean;
}

export function SegmentTable({ plan }: { plan: CardioSegment[] }) {
  const starts: number[] = [];
  plan.reduce((acc, s) => {
    starts.push(acc);
    return acc + s.durationSec;
  }, 0);
  const mins = (v: number) => (v % 60 === 0 ? `${v / 60}` : (v / 60).toFixed(1));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="py-1 font-medium">時間</th>
          <th className="py-1 font-medium">運動</th>
          <th className="py-1 font-medium">速度/負荷</th>
          <th className="py-1 font-medium">傾斜</th>
        </tr>
      </thead>
      <tbody>
        {plan.map((s, i) => {
          const start = starts[i];
          const t = start + s.durationSec;
          return (
            <tr key={s.id} className="border-t border-border">
              <td className="py-1 tabular">
                {mins(start)}〜{mins(t)}分
              </td>
              <td className="py-1">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${s.kind === "run" ? "bg-run/15 text-run" : s.kind === "bike" ? "bg-accent-soft text-accent" : "bg-walk/15 text-walk"}`}>{s.label ?? s.kind}</span>
              </td>
              <td className="py-1 tabular">{s.level !== undefined ? `L${s.level}` : s.speedKmh !== undefined ? `${s.speedKmh}${s.speedMaxKmh ? `〜${s.speedMaxKmh}` : ""}km/h` : "-"}</td>
              <td className="py-1 tabular">{s.inclinePct !== undefined ? `${s.inclinePct}%` : "-"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CardioCard({ entry: c, mutate, timerLink }: Props) {
  const [open, setOpen] = useState(!c.completed);
  const total = planTotalMin(c.plan);
  const run = planRunMin(c.plan);
  const dist = planDistanceKm(c.plan);
  const title = c.machine === "bike" ? "エアロバイク" : "トレッドミル";
  const patch = (p: Partial<CardioEntry>) => mutate((w) => ({ ...w, cardio: w.cardio.map((x) => (x.id === c.id ? { ...x, ...p } : x)) }));
  const patchActual = (p: Partial<NonNullable<CardioEntry["actual"]>>) => patch({ actual: { ...c.actual, ...p } });

  return (
    <section className={`card overflow-hidden ${c.skipped ? "opacity-60" : ""}`} data-testid="cardio-card">
      <header className="flex items-center gap-2 px-3 py-2.5" onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open} tabIndex={0}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${c.completed ? "bg-success text-white" : "bg-card-2 text-muted"}`}>{c.completed ? "✓" : c.machine === "bike" ? "🚴" : "🏃"}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold">
            {title} <span className="text-sm font-normal text-muted">{c.role === "warmup" ? "ウォームアップ" : ""}</span>
          </h3>
          <div className="text-xs text-muted">
            計画 {Math.round(total)}分{run ? `・ランニング${run}分` : ""}
            {dist ? `・約${dist.toFixed(1)}km` : ""}
          </div>
        </div>
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </header>
      {open && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-2">
          {c.rationale && <p className="text-xs text-muted">{c.rationale}</p>}
          {c.plan.length > 0 && <SegmentTable plan={c.plan} />}
          {timerLink && c.plan.length > 0 && !c.completed && (
            <Link href={`/timer/${c.machine}?entry=${c.id}`} className="btn-primary w-full">
              ⏱ タイマーを開始（{formatDuration(total * 60)}）
            </Link>
          )}
          <div className="rounded-xl bg-card-2 p-2">
            <div className="mb-1 text-xs font-semibold text-muted">実績（計画とは別に保存）</div>
            <div className="flex flex-wrap gap-2">
              <Field label="合計">
                <NumberField label="合計時間" unit="分" value={c.actual?.totalMin} onChange={(v) => patchActual({ totalMin: v })} step={1} max={180} size="sm" className="w-[9.5rem]" placeholder="未入力" />
              </Field>
              {c.machine === "treadmill" ? (
                <>
                  <Field label="走行">
                    <NumberField label="ランニング時間" unit="分" value={c.actual?.runMin} onChange={(v) => patchActual({ runMin: v })} step={1} max={120} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                  </Field>
                  <Field label="速度">
                    <NumberField label="ランニング速度" unit="km/h" value={c.actual?.runSpeedKmh} onChange={(v) => patchActual({ runSpeedKmh: v })} step={0.5} max={20} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                  </Field>
                  <Field label="最長連続">
                    <NumberField label="最長連続走行" unit="分" value={c.actual?.longestRunMin} onChange={(v) => patchActual({ longestRunMin: v })} step={1} max={60} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                  </Field>
                  <Field label="距離">
                    <NumberField label="距離" unit="km" value={c.actual?.distanceKm} onChange={(v) => patchActual({ distanceKm: v })} step={0.1} max={50} size="sm" className="w-[9.5rem]" placeholder="未入力" decimals={2} />
                  </Field>
                  <Field label="傾斜">
                    <NumberField label="傾斜" unit="%" value={c.actual?.inclinePct} onChange={(v) => patchActual({ inclinePct: v })} step={0.5} max={15} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                  </Field>
                </>
              ) : (
                <Field label="負荷">
                  <NumberField label="負荷レベル" unit="L" value={c.actual?.level} onChange={(v) => patchActual({ level: v })} step={1} max={30} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                </Field>
              )}
            </div>
            <input className="input mt-2 text-sm" placeholder="メモ（例：2分×4本、L15 2分→L20 3分）" value={c.actual?.note ?? ""} onChange={(e) => patchActual({ note: e.target.value })} aria-label="有酸素メモ" />
            {c.plan.length > 0 && !c.actual?.totalMin && (
              <button
                type="button"
                className="btn-ghost mt-1 px-2 py-1 text-xs text-accent"
                onClick={() =>
                  patchActual({
                    totalMin: Math.round(total),
                    runMin: run || undefined,
                    runSpeedKmh: c.plan.find((s) => s.kind === "run")?.speedKmh,
                    longestRunMin: run ? Math.max(...c.plan.filter((s) => s.kind === "run").map((s) => s.durationSec / 60)) : undefined,
                    distanceKm: dist ? Math.round(dist * 100) / 100 : undefined,
                    level: c.plan.find((s) => s.level)?.level,
                  })
                }
              >
                計画どおり実施した場合はここをタップして実績に反映
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={`flex-1 ${c.completed ? "btn-secondary" : "btn-primary"}`} onClick={() => patch({ completed: !c.completed, skipped: false })}>
              {c.completed ? "完了を取り消す" : "完了にする"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => patch({ skipped: !c.skipped, completed: false })}>
              {c.skipped ? "戻す" : "今日はやらない"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-muted">
      {label}
      {children}
    </label>
  );
}
