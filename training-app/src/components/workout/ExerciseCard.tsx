"use client";
import { useState } from "react";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { equipmentName } from "@/lib/catalog/equipment";
import { musclesLabel } from "@/lib/catalog/muscles";
import { findStore } from "@/lib/catalog/stores";
import { formatJaDate } from "@/lib/date/trainingDay";
import { addSet, isExerciseDone, removeExercise, removeSet, setExcluded, toggleSetCompleted, updateExercise, updateSet } from "@/lib/workout/edit";
import { GripIcon, TrashIcon } from "@/components/ui/Icons";
import { SetRow } from "./SetRow";
import { NumberField } from "@/components/ui/NumberField";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";

interface Props {
  exercise: WorkoutExercise;
  index: number;
  mutate: (fn: (w: Workout) => Workout) => void;
  collapsed: boolean;
  focused: boolean;
  onToggleCollapse: () => void;
  onFocus: () => void;
  /** セット完了時の休憩タイマー（null は閉じる：最終セットのとき） */
  onStartRest?: (sec: number | null) => void;
  /** 履歴編集モード（スキップなどは非表示） */
  editOnly?: boolean;
  /** この店舗での重量の刻み(kg)と、刻みを変えたときの保存先 */
  step?: number;
  onChangeStep?: (stepKg: number) => void;
  /** 長押しドラッグの並べ替え（カード全体と、つかむ見出し部分） */
  dragItem?: { ref: (el: HTMLElement | null) => void; style?: React.CSSProperties; "data-dragging"?: string };
  dragHandle?: { onPointerDown: (e: React.PointerEvent) => void; onClickCapture: (e: React.MouseEvent) => void; onContextMenu: (e: React.MouseEvent) => void; style?: React.CSSProperties };
}

export function ExerciseCard({ exercise: e, index, mutate, collapsed, focused, onToggleCollapse, onFocus, onStartRest, editOnly, dragItem, dragHandle, step, onChangeStep }: Props) {
  const def = getExercise(e.exerciseId);
  const weighted = def?.loadType === "weight" || def?.loadType === "assist";
  // 前回（同じ店舗）より重い重量・多い回数に挑戦するセットには注意書きを出す
  const prevLast = e.weightReference === "same_store" ? e.previous?.sets[e.previous.sets.length - 1] : undefined;
  const prevW = prevLast ? (prevLast.left?.weight ?? prevLast.weight) : undefined;
  const prevR = prevLast ? (prevLast.left?.reps ?? prevLast.reps) : undefined;
  const noticeFor = (s: WorkoutSet): string | undefined => {
    if (s.completed || s.excluded || !weighted) return undefined;
    const w = s.left?.weight ?? s.weight;
    const r = s.left?.reps ?? s.reps;
    if (prevW === undefined || w === undefined) return undefined;
    const harder = def?.loadType === "assist" ? w < prevW : w > prevW;
    if (harder) return `新しい重量に挑戦（前回 ${prevW}kg → ${w}kg）。フォームが崩れる・目標回数に届かないときは無理をせず前回の重量に戻してください`;
    if (w === prevW && prevR !== undefined && r !== undefined && r > prevR) return `回数に挑戦（前回 ${prevR}回 → ${r}回）。届かなければ、できた回数に直してからチェックしてください`;
    return undefined;
  };
  const toast = useToast();
  const [showInfo, setShowInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ set: WorkoutSet } | null>(null);
  const [confirmRemoveEx, setConfirmRemoveEx] = useState(false);
  const done = isExerciseDone(e);
  const active = e.sets.filter((s) => !s.excluded);
  const doneCount = active.filter((s) => s.completed).length;

  const handleRemoveSet = (s: WorkoutSet) => {
    if (s.completed) {
      setConfirmDelete({ set: s });
      return;
    }
    mutate((w) => removeSet(w, e.id, s.id));
  };
  const doRemoveSet = (s: WorkoutSet) => {
    const snapshot = s;
    const idx = e.sets.findIndex((x) => x.id === s.id);
    mutate((w) => removeSet(w, e.id, s.id));
    toast("完了済みセットを削除しました", "info", {
      label: "元に戻す",
      onClick: () =>
        mutate((w) => ({
          ...w,
          exercises: w.exercises.map((x) => {
            if (x.id !== e.id) return x;
            const sets = [...x.sets];
            sets.splice(Math.min(idx, sets.length), 0, snapshot);
            return { ...x, sets };
          }),
        })),
    });
  };

  const summary = active
    .map((s) => (def?.loadType === "time" ? `${s.seconds ?? "?"}秒` : s.weight !== undefined ? `${s.weight}` : "—"))
    .join(" / ");

  return (
    <section className={`card overflow-hidden ${focused ? "ring-2 ring-accent" : ""} ${e.status === "skipped" ? "opacity-60" : ""}`} data-testid="exercise-card" data-exercise-id={e.exerciseId} {...dragItem}>
      <header className="flex items-center gap-2 px-3 py-2.5" {...dragHandle} onClick={onToggleCollapse} role="button" aria-expanded={!collapsed} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && onToggleCollapse()}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-success text-white" : "bg-card-2 text-muted"}`}>{done ? "✓" : index + 1}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold">
            {e.name}
            {e.weightReference === "other_store" && <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] font-medium text-warn">他店舗の参考値</span>}
            {weighted && e.weightReference === "same_store" && <span className="ml-1 rounded bg-card-2 px-1 text-[10px] font-medium">この店舗の実績</span>}
          </h3>
          <div className="truncate text-xs text-muted">
            {musclesLabel(e.primary)} ・ {active.length}セット {def?.loadType === "time" ? "" : `×${active[0]?.reps ?? def?.defaultReps ?? "-"}回`} ・ {summary}
            {def?.loadType !== "time" && def?.loadType !== "reps" ? " kg" : ""}
          </div>
        </div>
        <div className="text-xs tabular text-muted">
          {doneCount}/{active.length}
        </div>
        <span className="text-muted">{collapsed ? "▸" : "▾"}</span>
        {dragHandle && (
          <span className="-mr-1 text-muted/60" title="長押しして上下に動かすと順番を入れ替えられます" aria-hidden="true">
            <GripIcon />
          </span>
        )}
      </header>

      {!collapsed && (
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          {e.previous && (
            <div className="rounded-lg bg-card-2 px-2 py-1.5 text-xs text-muted">
              {weighted ? e.weightReference === "same_store" ? "この店舗の基準" : "他店舗の参考" : "前回"} {formatJaDate(e.previous.trainingDate)}・{findStore(e.previous.storeId)?.shortName ?? e.previous.storeLabel ?? "別の店舗"}：{" "}
              <span className="text-fg tabular">
                {e.previous.sets
                  .map((s) => (s.seconds !== undefined && s.weight === undefined ? `${s.seconds}秒` : s.left?.weight !== undefined ? `${s.left.weight}` : s.weight !== undefined ? `${s.weight}` : "?"))
                  .join(" / ")}
                {e.previous.sets.some((s) => s.weight !== undefined) ? " kg" : ""}
              </span>
              {e.previous.sets.some((s) => s.actualReps !== undefined) && <span>（{e.previous.sets.map((s) => s.actualReps ?? "?").join("/")}回）</span>}
            </div>
          )}
          {weighted && e.otherStorePrevious && (
            <div className="rounded-lg bg-card-2 px-2 py-1.5 text-xs text-muted" data-testid="other-store-reference">
              他店舗の参考 {formatJaDate(e.otherStorePrevious.trainingDate)}・{findStore(e.otherStorePrevious.storeId)?.shortName ?? e.otherStorePrevious.storeLabel ?? "別の店舗"}：
              {e.otherStorePrevious.sets.map((s) => s.left || s.right
                ? `左${s.left?.weight ?? "?"} / 右${s.right?.weight ?? "?"} kg`
                : `${s.weight ?? "?"} kg`).join("、")}。同じ負荷とは限らないため、この店舗の基準には上書きしません。
            </div>
          )}
          {weighted && !editOnly && <p className="text-xs text-muted">この店舗で実際に使った重量・回数に直して完了をチェックしてください。トレーニング終了後、次回この店舗での重量調整に使います。</p>}
          {e.rationale && <p className="text-xs text-muted">{e.rationale}</p>}
          {e.note && !showInfo && <p className="text-xs">📝 {e.note}</p>}

          <div className="space-y-1.5">
            {e.sets.map((s, i) => (
              <SetRow
                key={s.id}
                index={i}
                set={s}
                def={def}
                step={step}
                notice={noticeFor(s)}
                onChange={(patch) => mutate((w) => updateSet(w, e.id, s.id, patch))}
                onToggle={() => {
                  mutate((w) => toggleSetCompleted(w, e.id, s.id));
                  if (!s.completed && onStartRest) {
                    // この種目の最終セットを終えたとき、時間の種目（プランクなど。セットのタイマーで数える）は休憩タイマーを出さない（出ていれば閉じる）
                    const remaining = e.sets.filter((x) => x.id !== s.id && !x.excluded && !x.completed).length;
                    onStartRest(remaining > 0 && def?.loadType !== "time" ? e.restSec : null);
                  }
                }}
                onRemove={() => handleRemoveSet(s)}
                onExclude={(ex) => mutate((w) => setExcluded(w, e.id, s.id, ex))}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={() => mutate((w) => addSet(w, e.id))} data-testid="add-set">
              ＋ セット追加
            </button>
            <button type="button" className={`btn-secondary ${showInfo ? "border-accent text-accent" : ""}`} onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo} data-testid="form-toggle">
              フォーム・メモ {showInfo ? "▾" : "▸"}
            </button>
          </div>

          {showInfo && (
            <div className="space-y-2 rounded-xl bg-card-2 p-3 text-sm" data-testid="form-panel">
              {def && (
                <>
                  <div className="text-xs text-muted">
                    器具：{equipmentName(def.equipmentId)} ・ 休憩 {e.restSec}秒 ・ 対象：{musclesLabel(def.primary)}
                    {def.secondary.length ? `（補助：${musclesLabel(def.secondary)}）` : ""}
                  </div>
                  <InfoList title="フォーム" items={def.form} />
                  <InfoList title="シート・パッド設定" items={def.setup} />
                  <InfoList title="注意点" items={def.cautions} />
                  {weighted && onChangeStep && (
                    <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      この店舗の重量の刻み
                      <NumberField label="重量の刻み" unit="kg" value={step} onChange={(v) => v && v > 0 && onChangeStep(v)} step={0.5} min={0.5} max={20} size="sm" className="w-40 shrink-0" />
                      <span className="w-full text-[11px]">{equipmentName(def.equipmentId)}で何kgずつ変えられるか。次回のメニュー作成と ± ボタンに使います</span>
                    </label>
                  )}
                </>
              )}
              <input
                className="input text-sm"
                placeholder="メモ（マシンの番号、シート位置など）"
                value={e.note ?? ""}
                onChange={(ev) => mutate((w) => updateExercise(w, e.id, { note: ev.target.value }))}
                aria-label="種目メモ"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
            {!editOnly && (
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onFocus}>
                {focused ? "フォーカス解除" : "この種目に集中"}
              </button>
            )}
            <button type="button" className="tap ml-auto flex items-center gap-1 px-2 text-danger" onClick={() => setConfirmRemoveEx(true)} aria-label="種目を削除">
              <TrashIcon className="h-4 w-4" />
              削除
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="完了済みのセットを削除しますか？"
        message="記録済みのセットです。削除後も「元に戻す」で復元できます。未実施として残したい場合は「−」ボタンで除外してください。"
        confirmLabel="削除"
        danger
        onConfirm={() => confirmDelete && doRemoveSet(confirmDelete.set)}
        onClose={() => setConfirmDelete(null)}
      />
      <ConfirmDialog
        open={confirmRemoveEx}
        title={`${e.name} を削除しますか？`}
        message={doneCount > 0 ? `完了済みのセットが ${doneCount} 件あります。削除すると記録から消えます。` : "この種目をメニューから外します。"}
        confirmLabel="削除"
        danger
        onConfirm={() => mutate((w) => removeExercise(w, e.id))}
        onClose={() => setConfirmRemoveEx(false)}
      />
    </section>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-muted">{title}</div>
      <ul className="ml-4 list-disc space-y-0.5">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
