"use client";
import { useState } from "react";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { equipmentName } from "@/lib/catalog/equipment";
import { musclesLabel } from "@/lib/catalog/muscles";
import { storeName } from "@/lib/catalog/stores";
import { formatJaDate } from "@/lib/date/trainingDay";
import { addSet, isExerciseDone, moveExercise, removeExercise, removeSet, setExcluded, setExerciseStatus, toggleSetCompleted, updateExercise, updateSet } from "@/lib/workout/edit";
import { SetRow } from "./SetRow";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";

interface Props {
  exercise: WorkoutExercise;
  index: number;
  total: number;
  mutate: (fn: (w: Workout) => Workout) => void;
  collapsed: boolean;
  focused: boolean;
  onToggleCollapse: () => void;
  onFocus: () => void;
  onStartRest?: (sec: number) => void;
  /** 履歴編集モード（並べ替え・スキップなどは非表示） */
  editOnly?: boolean;
}

export function ExerciseCard({ exercise: e, index, total, mutate, collapsed, focused, onToggleCollapse, onFocus, onStartRest, editOnly }: Props) {
  const def = getExercise(e.exerciseId);
  const toast = useToast();
  const [showInfo, setShowInfo] = useState(false);
  const [showActual, setShowActual] = useState(false);
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
    <section className={`card overflow-hidden ${focused ? "ring-2 ring-accent" : ""} ${e.status === "skipped" ? "opacity-60" : ""}`} data-testid="exercise-card" data-exercise-id={e.exerciseId}>
      <header className="flex items-center gap-2 px-3 py-2.5" onClick={onToggleCollapse} role="button" aria-expanded={!collapsed} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && onToggleCollapse()}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-success text-white" : "bg-card-2 text-muted"}`}>{done ? "✓" : index + 1}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold">
            {e.name}
            {e.weightReference === "other_store" && <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] font-medium text-warn">参考値</span>}
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
      </header>

      {!collapsed && (
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          {e.previous && (
            <div className="rounded-lg bg-card-2 px-2 py-1.5 text-xs text-muted">
              前回 {formatJaDate(e.previous.trainingDate)}・{storeName(e.previous.storeId, true)}：{" "}
              <span className="text-fg tabular">
                {e.previous.sets
                  .map((s) => (s.seconds !== undefined && s.weight === undefined ? `${s.seconds}秒` : s.left?.weight !== undefined ? `${s.left.weight}` : s.weight !== undefined ? `${s.weight}` : "?"))
                  .join(" / ")}
                {e.previous.sets.some((s) => s.weight !== undefined) ? " kg" : ""}
              </span>
              {e.previous.sets.some((s) => s.actualReps !== undefined) && <span>（{e.previous.sets.map((s) => s.actualReps ?? "?").join("/")}回）</span>}
            </div>
          )}
          {e.rationale && <p className="text-xs text-muted">{e.rationale}</p>}

          <div className="space-y-1.5">
            {e.sets.map((s, i) => (
              <SetRow
                key={s.id}
                index={i}
                set={s}
                def={def}
                showActual={showActual}
                onChange={(patch) => mutate((w) => updateSet(w, e.id, s.id, patch))}
                onToggle={() => {
                  mutate((w) => toggleSetCompleted(w, e.id, s.id));
                  if (!s.completed && onStartRest && e.restSec > 0) onStartRest(e.restSec);
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
            <button type="button" className={`btn-secondary ${showActual ? "border-accent text-accent" : ""}`} onClick={() => setShowActual((v) => !v)}>
              実回数
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
              フォーム
            </button>
          </div>

          {showInfo && def && (
            <div className="space-y-2 rounded-xl bg-card-2 p-3 text-sm">
              <div className="text-xs text-muted">
                器具：{equipmentName(def.equipmentId)} ・ 休憩 {e.restSec}秒 ・ 対象：{musclesLabel(def.primary)}
                {def.secondary.length ? `（補助：${musclesLabel(def.secondary)}）` : ""}
              </div>
              <InfoList title="フォーム" items={def.form} />
              <InfoList title="シート・パッド設定" items={def.setup} />
              <InfoList title="注意点" items={def.cautions} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
            {!editOnly && (
              <>
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onFocus}>
                  {focused ? "フォーカス解除" : "この種目に集中"}
                </button>
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => mutate((w) => setExerciseStatus(w, e.id, e.status === "skipped" ? "planned" : "skipped"))}>
                  {e.status === "skipped" ? "スキップ解除" : "今日はスキップ"}
                </button>
              </>
            )}
            <span className="ml-auto flex items-center gap-1">
              <label className="flex items-center gap-1 text-muted">
                休憩
                <select className="rounded-lg border border-border bg-card px-1 py-1" value={e.restSec} onChange={(ev) => mutate((w) => updateExercise(w, e.id, { restSec: Number(ev.target.value) }))} aria-label="休憩時間">
                  {[30, 45, 60, 75, 90, 120, 150, 180].map((s) => (
                    <option key={s} value={s}>
                      {s}秒
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="tap px-2 text-muted disabled:opacity-30" disabled={index === 0} onClick={() => mutate((w) => moveExercise(w, e.id, -1))} aria-label="上へ移動">
                ↑
              </button>
              <button type="button" className="tap px-2 text-muted disabled:opacity-30" disabled={index === total - 1} onClick={() => mutate((w) => moveExercise(w, e.id, 1))} aria-label="下へ移動">
                ↓
              </button>
              <button type="button" className="tap px-2 text-danger" onClick={() => setConfirmRemoveEx(true)} aria-label="種目を削除">
                削除
              </button>
            </span>
          </div>
          <input
            className="input text-sm"
            placeholder="メモ（マシンの番号、シート位置など）"
            value={e.note ?? ""}
            onChange={(ev) => mutate((w) => updateExercise(w, e.id, { note: ev.target.value }))}
            aria-label="種目メモ"
          />
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
