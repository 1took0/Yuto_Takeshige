"use client";
import { Collapsible } from "@/components/ui/Collapsible";
import { useState } from "react";
import { useExercises, useSettings } from "@/hooks/useSettings";
import { deleteExercise, restoreExercise } from "@/lib/db/repo";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { CloseIcon } from "@/components/ui/Icons";
import { CustomExerciseForm } from "./CustomExerciseForm";
import { musclesLabel } from "@/lib/catalog/muscles";
import { equipmentName } from "@/lib/catalog/equipment";
import { deletedBuiltinExercises } from "@/lib/catalog/exercises";
import type { ExerciseDef } from "@/lib/types";

/** 種目の一覧（標準＋自作）。× で削除、自作の種目は編集・追加もできる */
export function CustomExerciseManager() {
  // 設定（削除・追加した種目）が変わったら描き直す
  useSettings();
  const all = useExercises();
  // settings を読んでから引く（削除した種目のレジストリが最新になっている）
  // useSettings が削除・追加した種目を反映した後の一覧
  const deleted = deletedBuiltinExercises();
  const [q, setQ] = useState("");
  const [form, setForm] = useState<{ editing?: ExerciseDef } | null>(null);
  const [removing, setRemoving] = useState<ExerciseDef | null>(null);
  const mine = all.filter((e) => e.custom);
  const list = [...mine, ...all.filter((e) => !e.custom)].filter((e) => !q || e.name.includes(q) || musclesLabel(e.primary).includes(q) || equipmentName(e.equipmentId).includes(q));
  return (
    <Collapsible
      id="exercises"
      title="種目一覧"
      hint="種目の追加やメニューの自動作成に出る種目です。× で削除できます（過去の記録は種目名ごと残ります）。一覧に無い種目は自分で作れます。"
      badge={<span className="text-xs text-muted">{all.length}件</span>}
    >
      <div className="space-y-3">
        <button type="button" className="btn-secondary w-full" onClick={() => setForm({})} data-testid="custom-ex-new">
          ＋ 新しい種目を作る
        </button>
        <input className="input" placeholder="種目名・部位・器具で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="種目一覧の検索" />
        <ul className="divide-y divide-border" data-testid="custom-ex-list">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2 text-sm" data-testid="exercise-row">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {e.name}
                  {e.custom && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] text-accent">自分の種目</span>}
                  {e.custom && e.autoMenu && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] text-accent">自動作成</span>}
                </div>
                <div className="truncate text-xs text-muted">
                  {musclesLabel(e.primary)} ・ {equipmentName(e.equipmentId)} ・ {e.defaultSets}セット
                  {e.loadType === "time" ? `×${e.defaultSeconds}秒` : `×${e.defaultReps}回`}
                </div>
              </div>
              {e.custom && (
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setForm({ editing: e })}>
                  編集
                </button>
              )}
              <button type="button" className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-danger" aria-label={`${e.name}を削除`} onClick={() => setRemoving(e)}>
                <CloseIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!list.length && <li className="py-4 text-center text-sm text-muted">該当する種目がありません</li>}
        </ul>
        {deleted.length > 0 && (
          <details data-testid="deleted-ex">
            <summary className="cursor-pointer text-xs font-semibold text-accent">一覧に入っていない標準の種目（{deleted.length}件）</summary>
            <ul className="mt-1 divide-y divide-border">
              {deleted.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-muted">{e.name}</span>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => restoreExercise(e.id)}>
                    一覧に加える
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <CustomExerciseForm open={!!form} editing={form?.editing} onClose={() => setForm(null)} />
        <DeleteExerciseDialog exercise={removing} onClose={() => setRemoving(null)} />
      </div>
    </Collapsible>
  );
}

/** 種目の削除の確認（設定の種目一覧と、トレーニング中の「種目を追加」で使う） */
export function DeleteExerciseDialog({ exercise, onClose }: { exercise: ExerciseDef | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={!!exercise}
      title={`${exercise?.name ?? ""} を削除しますか？`}
      message={
        exercise?.custom
          ? "今後のメニューや種目の追加に出なくなります。過去の記録は種目名ごと残ります。"
          : "今後のメニューや種目の追加に出なくなります。過去の記録は種目名ごと残ります。標準の種目は、設定の「種目一覧」からいつでも元に戻せます。"
      }
      confirmLabel="削除"
      danger
      onConfirm={() => exercise && deleteExercise(exercise.id)}
      onClose={onClose}
    />
  );
}
