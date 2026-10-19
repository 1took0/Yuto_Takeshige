"use client";
import { Collapsible } from "@/components/ui/Collapsible";
import { useState } from "react";
import { useExercises } from "@/hooks/useSettings";
import { deleteCustomExercise } from "@/lib/db/repo";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { CustomExerciseForm } from "./CustomExerciseForm";
import { musclesLabel } from "@/lib/catalog/muscles";
import { equipmentName } from "@/lib/catalog/equipment";
import type { ExerciseDef } from "@/lib/types";

/** 自分で作った種目の一覧と追加・編集・削除 */
export function CustomExerciseManager() {
  const mine = useExercises().filter((e) => e.custom);
  const [form, setForm] = useState<{ editing?: ExerciseDef } | null>(null);
  const [removing, setRemoving] = useState<ExerciseDef | null>(null);
  return (
    <Collapsible id="exercises" title="自分の種目" hint="カタログに無い種目を作れます。トレーニング中の「種目を追加」や、メニューの自動作成で使えます。" badge={mine.length ? <span className="text-xs text-muted">{mine.length}件</span> : undefined}>
      <div className="space-y-3">
      {mine.length === 0 ? (
        <p className="text-sm text-muted">まだありません。</p>
      ) : (
        <ul className="divide-y divide-border" data-testid="custom-ex-list">
          {mine.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {e.name}
                  {e.autoMenu && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] text-accent">自動作成</span>}
                </div>
                <div className="truncate text-xs text-muted">
                  {musclesLabel(e.primary)} ・ {equipmentName(e.equipmentId)} ・ {e.defaultSets}セット
                  {e.loadType === "time" ? `×${e.defaultSeconds}秒` : `×${e.defaultReps}回`}
                </div>
              </div>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setForm({ editing: e })}>
                編集
              </button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs text-danger" onClick={() => setRemoving(e)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-secondary w-full" onClick={() => setForm({})} data-testid="custom-ex-new">
        ＋ 新しい種目を作る
      </button>
      <CustomExerciseForm open={!!form} editing={form?.editing} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!removing}
        title={`${removing?.name ?? ""} を削除しますか？`}
        message="今後のメニューや種目の追加に出なくなります。過去の記録は種目名ごと残ります。"
        confirmLabel="削除"
        danger
        onConfirm={() => removing && deleteCustomExercise(removing.id)}
        onClose={() => setRemoving(null)}
      />
      </div>
    </Collapsible>
  );
}
