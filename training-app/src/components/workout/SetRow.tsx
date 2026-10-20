"use client";
import type { ExerciseDef, WorkoutSet } from "@/lib/types";
import { NumberField } from "@/components/ui/NumberField";
import { TrashIcon } from "@/components/ui/Icons";
import { defaultStepOf } from "@/lib/planner/progression";

interface Props {
  index: number;
  set: WorkoutSet;
  def: ExerciseDef | undefined;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onRemove: () => void;
  onExclude: (excluded: boolean) => void;
  /** この店舗での重量の刻み(kg) */
  step?: number;
  /** セットの下に出す注意書き（新しい重量への挑戦など） */
  notice?: string;
}

export function SetRow({ index, set, def, onChange, onToggle, onRemove, onExclude, step: stepProp, notice }: Props) {
  const isTime = def?.loadType === "time";
  const isRepsOnly = def?.loadType === "reps";
  const unilateral = !!def?.unilateral && !isTime;
  const step = stepProp && stepProp > 0 ? stepProp : def ? defaultStepOf(def) : 1;

  return (
    <div className={`rounded-xl border border-border p-2 ${set.excluded ? "opacity-50" : ""} ${set.completed ? "bg-success-soft/60" : "bg-card"}`} data-testid="set-row">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={set.excluded}
          aria-pressed={set.completed}
          aria-label={`セット${index + 1}を${set.completed ? "未完了に戻す" : "完了にする"}`}
          className={`tap flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-2xl font-bold transition ${
            set.completed ? "border-success bg-success text-white" : "border-border bg-card text-transparent"
          }`}
        >
          ✓
        </button>
        <div className="w-4 shrink-0 text-center text-xs font-semibold text-muted">{index + 1}</div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {isTime ? (
            <NumberField label="秒数" unit="秒" value={set.seconds} onChange={(v) => onChange({ seconds: v })} step={5} max={600} className="w-full max-w-[13rem]" />
          ) : unilateral ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="w-4 text-xs text-muted">左</span>
                <NumberField label="左の重量" unit="kg" value={set.left?.weight ?? set.weight} onChange={(v) => onChange({ left: { ...set.left, weight: v }, weight: v })} step={step} size="sm" className="w-[6.5rem]" />
                <NumberField label="左の目標回数" unit="回" value={set.left?.reps ?? set.reps} onChange={(v) => onChange({ left: { ...set.left, reps: v }, reps: v })} step={1} max={100} className="w-[6rem]" size="sm" />
              </div>
              <div className="flex items-center gap-1">
                <span className="w-4 text-xs text-muted">右</span>
                <NumberField label="右の重量" unit="kg" value={set.right?.weight ?? set.weight} onChange={(v) => onChange({ right: { ...set.right, weight: v } })} step={step} size="sm" className="w-[6.5rem]" />
                <NumberField label="右の目標回数" unit="回" value={set.right?.reps ?? set.reps} onChange={(v) => onChange({ right: { ...set.right, reps: v } })} step={1} max={100} className="w-[6rem]" size="sm" />
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-1">
              {!isRepsOnly && <NumberField label="重量" unit="kg" value={set.weight} onChange={(v) => onChange({ weight: v })} step={step} className="w-full max-w-[13rem]" />}
              <NumberField label="目標回数" unit="回" value={set.reps} onChange={(v) => onChange({ reps: v })} step={1} max={100} size="sm" className="w-full max-w-[13rem]" />
            </div>
          )}
        </div>
        <SetMenu set={set} onRemove={onRemove} onExclude={onExclude} />
      </div>
      {notice && (
        <p className="mt-1.5 rounded-lg bg-warn-soft px-2 py-1 text-[11px] text-warn" data-testid="set-notice">
          ⚠ {notice}
        </p>
      )}
    </div>
  );
}

function SetMenu({ set, onRemove, onExclude }: { set: WorkoutSet; onRemove: () => void; onExclude: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <button type="button" className="tap flex h-9 w-9 items-center justify-center rounded-lg text-muted active:bg-card-2" onClick={onRemove} aria-label="セットを削除" title="セットを削除">
        <TrashIcon />
      </button>
      <button
        type="button"
        className={`tap h-9 w-9 rounded-lg text-xs ${set.excluded ? "text-accent" : "text-muted"} active:bg-card-2`}
        onClick={() => onExclude(!set.excluded)}
        aria-label={set.excluded ? "セットを記録に戻す" : "未実施として除外"}
        title={set.excluded ? "記録に戻す" : "未実施として除外"}
      >
        {set.excluded ? "↩" : "−"}
      </button>
    </div>
  );
}
