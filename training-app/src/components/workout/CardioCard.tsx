"use client";
import Link from "next/link";
import { useState } from "react";
import type { CardioEntry, CardioSegment, Workout } from "@/lib/types";
import { NumberField } from "@/components/ui/NumberField";
import { formatDuration } from "@/lib/date/trainingDay";
import { planDistanceKm, planRunMin, planTotalMin } from "@/lib/planner/cardio";
import { removeCardio } from "@/lib/workout/edit";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { BikeIcon, GripIcon, RunIcon, TimerIcon, TrashIcon } from "@/components/ui/Icons";
import { SegmentEditor } from "@/components/timer/SegmentEditor";

interface Props {
  entry: CardioEntry;
  mutate: (fn: (w: Workout) => Workout) => void;
  /** タイマーへのリンクを出す（アクティブ時） */
  timerLink?: boolean;
  /** 開閉を親（トレーニング画面）が決めるとき。未指定なら自分で持つ */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** 長押しドラッグの並べ替え（カード全体と、つかむ見出し部分） */
  dragItem?: { ref: (el: HTMLElement | null) => void; style?: React.CSSProperties; "data-dragging"?: string };
  dragHandle?: { onPointerDown: (e: React.PointerEvent) => void; onClickCapture: (e: React.MouseEvent) => void; onContextMenu: (e: React.MouseEvent) => void; style?: React.CSSProperties };
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

export function CardioCard({ entry: c, mutate, timerLink, dragItem, dragHandle, collapsed, onToggleCollapse }: Props) {
  const [openState, setOpenState] = useState(!c.completed);
  const open = collapsed === undefined ? openState : !collapsed;
  const toggleOpen = () => (onToggleCollapse ? onToggleCollapse() : setOpenState((v) => !v));
  // 実績の入力欄は、計画と違ったときだけ開く（完了にするだけなら計画どおりとして記録）
  const [showActual, setShowActual] = useState(false);
  const hasActual = !!c.actual?.totalMin || !!c.actual?.note;
  const [confirmRemove, setConfirmRemove] = useState(false);
  // 計画の時間・負荷を自分で変える
  const [editing, setEditing] = useState(false);
  const total = planTotalMin(c.plan);
  const run = planRunMin(c.plan);
  const dist = planDistanceKm(c.plan);
  const title = c.machine === "bike" ? "エアロバイク" : "トレッドミル";
  const patch = (p: Partial<CardioEntry>) => mutate((w) => ({ ...w, cardio: w.cardio.map((x) => (x.id === c.id ? { ...x, ...p } : x)) }));
  const patchActual = (p: Partial<NonNullable<CardioEntry["actual"]>>) => patch({ actual: { ...c.actual, ...p } });
  /** 計画どおり行ったときの実績 */
  const planActual = (): NonNullable<CardioEntry["actual"]> => ({
    totalMin: Math.round(total),
    runMin: run || undefined,
    runSpeedKmh: c.plan.find((s) => s.kind === "run")?.speedKmh,
    longestRunMin: run ? Math.max(...c.plan.filter((s) => s.kind === "run").map((s) => s.durationSec / 60)) : undefined,
  });
  const complete = () => patch({ completed: true, skipped: false, actual: hasActual || !c.plan.length ? c.actual : { ...c.actual, ...planActual() } });

  return (
    <section className={`card overflow-hidden ${c.skipped ? "opacity-60" : ""}`} data-testid="cardio-card" {...dragItem}>
      <header className="flex items-center gap-2 px-3 py-2.5" {...dragHandle} onClick={toggleOpen} role="button" aria-expanded={open} tabIndex={0}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${c.completed ? "bg-success text-white" : "bg-card-2 text-muted"}`}>{c.completed ? "✓" : c.machine === "bike" ? <BikeIcon className="h-5 w-5" /> : <RunIcon className="h-5 w-5" />}</div>
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
        {dragHandle && (
          <span className="-mr-1 text-muted/60" title="長押しして上下に動かすと順番を入れ替えられます" aria-hidden="true">
            <GripIcon />
          </span>
        )}
      </header>
      {open && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-2">
          {c.rationale && <p className="text-xs text-muted">{c.rationale}</p>}
          {c.plan.length > 0 && (editing ? <SegmentEditor segments={c.plan} onChange={(plan) => patch({ plan })} /> : <SegmentTable plan={c.plan} />)}
          {c.plan.length > 0 && !c.completed && (
            <button type="button" className="btn-ghost w-full py-1.5 text-sm text-accent" onClick={() => setEditing((v) => !v)} data-testid="cardio-edit">
              {editing ? "変更を終える" : "時間・負荷を変更"}
            </button>
          )}
          {timerLink && c.plan.length > 0 && !c.completed && (
            <Link href={`/timer/${c.machine}?entry=${c.id}`} className="btn-primary w-full">
              <span className="inline-flex items-center gap-1.5">
                <TimerIcon className="h-5 w-5" />
                タイマーを開始（{formatDuration(total * 60)}）
              </span>
            </Link>
          )}
          {!showActual && !hasActual && !c.completed && c.plan.length > 0 && (
            <button type="button" className="btn-ghost w-full py-1.5 text-sm text-accent" onClick={() => setShowActual(true)} data-testid="cardio-actual-open">
              実績を入力（計画と違ったとき）
            </button>
          )}
          {(showActual || hasActual || c.completed || !c.plan.length) && (
          <div className="rounded-xl bg-card-2 p-2">
            <div className="mb-1 text-xs font-semibold text-muted">実績（計画とは別に保存）</div>
            <div className="flex flex-wrap gap-2">
              <Field label="合計">
                <NumberField label="合計時間" unit="分" value={c.actual?.totalMin} onChange={(v) => patchActual({ totalMin: v })} step={1} max={180} size="sm" className="w-[9.5rem]" placeholder="未入力" />
              </Field>
              {c.machine === "treadmill" && (
                <>
                  <Field label="走行">
                    <NumberField label="ランニング時間" unit="分" value={c.actual?.runMin} onChange={(v) => patchActual({ runMin: v })} step={1} max={120} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                  </Field>
                  <Field label="速度">
                    <NumberField label="ランニング速度" unit="km/h" value={c.actual?.runSpeedKmh} onChange={(v) => patchActual({ runSpeedKmh: v })} step={0.5} max={20} size="sm" className="w-[9.5rem]" placeholder="未入力" />
                  </Field>
                </>
              )}
            </div>
            <input className="input mt-2 text-sm" placeholder="メモ（例：2分×4本）" value={c.actual?.note ?? ""} onChange={(e) => patchActual({ note: e.target.value })} aria-label="有酸素メモ" />
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
                  })
                }
              >
                計画どおり実施した場合はここをタップして実績に反映
              </button>
            )}
          </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" className={`flex-1 ${c.completed ? "btn-secondary" : "btn-primary"}`} onClick={() => (c.completed ? patch({ completed: false }) : complete())} data-testid="cardio-complete">
              {c.completed ? "完了を取り消す" : hasActual || !c.plan.length ? "完了にする" : "計画どおり完了にする"}
            </button>
            <button type="button" className="tap flex items-center gap-1 px-2 text-sm text-danger" onClick={() => setConfirmRemove(true)} aria-label={`${title}を削除`} data-testid="cardio-delete">
              <TrashIcon className="h-4 w-4" />
              削除
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={`${title}を削除しますか？`}
        message={c.completed || c.actual?.totalMin ? "入力した実績も記録から消えます。" : "このメニューから外します。"}
        confirmLabel="削除"
        danger
        onConfirm={() => mutate((w) => removeCardio(w, c.id))}
        onClose={() => setConfirmRemove(false)}
      />
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
