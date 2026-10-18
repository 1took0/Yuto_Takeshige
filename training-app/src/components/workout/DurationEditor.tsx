"use client";
import type { WorkoutDurations } from "@/lib/types";
import { NumberField } from "@/components/ui/NumberField";

const FIELDS: { key: keyof Omit<WorkoutDurations, "manual">; label: string }[] = [
  { key: "totalMin", label: "合計" },
  { key: "machineMin", label: "マシン" },
  { key: "dumbbellMin", label: "ダンベル" },
  { key: "bodyweightMin", label: "自重・体幹" },
  { key: "cardioMin", label: "有酸素" },
];

/** トレーニング時間の内訳（分）の編集。変更すると manual=true になり自動計算で上書きされない */
export function DurationEditor({ value, onChange }: { value: WorkoutDurations | undefined; onChange: (d: WorkoutDurations) => void }) {
  const v = value ?? {};
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="duration-editor">
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-0.5 text-[11px] text-muted">
          {f.label}
          <NumberField label={`${f.label}の時間`} unit="分" value={v[f.key]} onChange={(n) => onChange({ ...v, [f.key]: n, manual: true })} step={5} max={600} size="sm" className="w-full" placeholder="—" decimals={0} />
        </label>
      ))}
    </div>
  );
}
