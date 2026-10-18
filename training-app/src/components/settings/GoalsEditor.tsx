"use client";
import { useState } from "react";
import type { Goals, Objective } from "@/lib/types";
import { MultiChipGroup, ChipGroup } from "@/components/ui/Chips";
import { NumberField } from "@/components/ui/NumberField";
import { REGION_LABEL, REGION_ORDER } from "@/lib/catalog/muscles";
import { OBJECTIVE_LABEL } from "@/lib/goals";
import { useExercises } from "@/hooks/useSettings";

/** 目標の編集（初回設定と設定画面で共用） */
export function GoalsEditor({ value, onChange }: { value: Goals; onChange: (g: Goals) => void }) {
  const [showFav, setShowFav] = useState(value.favoriteExerciseIds.length > 0);
  const allEx = useExercises();
  const set = <K extends keyof Goals>(k: K, v: Goals[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4" data-testid="goals-editor">
      <div>
        <div className="mb-1 text-xs font-semibold text-muted">目標（複数選択）</div>
        <MultiChipGroup label="目標" options={(Object.keys(OBJECTIVE_LABEL) as Objective[]).map((o) => ({ value: o, label: OBJECTIVE_LABEL[o] }))} value={value.objectives} onChange={(v) => set("objectives", v)} />
        <p className="mt-1 text-[11px] text-muted">体脂肪減少・ランニングを選ぶと有酸素の時間を多めに、筋力向上だけを選ぶと8回前後の重量を提案します。</p>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-muted">特に鍛えたい部位（未選択なら全身バランス）</div>
        <MultiChipGroup label="特に鍛えたい部位" options={REGION_ORDER.map((r) => ({ value: r, label: REGION_LABEL[r] }))} value={value.priorityRegions} onChange={(v) => set("priorityRegions", v)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value.preferDumbbell} onChange={(e) => set("preferDumbbell", e.target.checked)} data-testid="prefer-dumbbell" />
        マシンよりダンベル種目を優先する
      </label>
      <div>
        <div className="mb-1 text-xs font-semibold text-muted">左右差（弱い側）</div>
        <ChipGroup
          label="弱い側"
          options={[
            { value: "none" as const, label: "なし" },
            { value: "left" as const, label: "左が弱い" },
            { value: "right" as const, label: "右が弱い" },
          ]}
          value={value.weakSide}
          onChange={(v) => set("weakSide", v)}
          columns={3}
        />
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-muted">ランニングの開始速度（実績がないとき）</div>
        <NumberField label="ランニング開始速度" unit="km/h" value={value.runStartSpeedKmh} onChange={(v) => set("runStartSpeedKmh", v ?? 8)} step={0.5} min={5} max={18} className="w-44" />
      </div>
      <div>
        <button type="button" className="text-xs font-semibold text-accent" onClick={() => setShowFav((v) => !v)} aria-expanded={showFav}>
          {showFav ? "▾" : "▸"} 定期的に入れたい種目（{value.favoriteExerciseIds.length}件）
        </button>
        {showFav && (
          <ul className="mt-1 grid grid-cols-1 gap-0.5 text-sm">
            {allEx.map((e) => (
              <li key={e.id}>
                <label className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={value.favoriteExerciseIds.includes(e.id)}
                    onChange={(ev) => set("favoriteExerciseIds", ev.target.checked ? [...value.favoriteExerciseIds, e.id] : value.favoriteExerciseIds.filter((x) => x !== e.id))}
                  />
                  {e.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
