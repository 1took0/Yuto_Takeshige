"use client";
import { useState } from "react";
import type { ExerciseDef, MuscleGroup } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { ChipGroup, MultiChipGroup } from "@/components/ui/Chips";
import { NumberField } from "@/components/ui/NumberField";
import { MUSCLE_LABEL } from "@/lib/catalog/muscles";
import { EQUIPMENT } from "@/lib/catalog/equipment";
import { addCustomExercise, updateCustomExercise } from "@/lib/db/repo";
import type { CustomExerciseInput } from "@/lib/catalog/exercises";
import { useToast } from "@/components/ui/Toast";

const MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleGroup[];

function toInput(def?: ExerciseDef): CustomExerciseInput {
  return {
    name: def?.name ?? "",
    equipmentId: def?.equipmentId ?? "dumbbells",
    primary: def?.primary ?? [],
    loadType: (def?.loadType === "reps" || def?.loadType === "time" ? def.loadType : "weight") as CustomExerciseInput["loadType"],
    unilateral: !!def?.unilateral,
    defaultSets: def?.defaultSets ?? 3,
    defaultReps: def?.defaultReps ?? 10,
    defaultSeconds: def?.defaultSeconds ?? 30,
    increment: def?.increment || 2.5,
    restSec: def?.restSec ?? 60,
    notes: def?.form.join("\n") ?? "",
    autoMenu: !!def?.autoMenu,
  };
}

/** 自作種目の作成・編集 */
export function CustomExerciseForm({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: ExerciseDef; onSaved?: (def: ExerciseDef | null) => void }) {
  const toast = useToast();
  const [v, setV] = useState<CustomExerciseInput>(() => toInput(editing));
  const [prevKey, setPrevKey] = useState<string | undefined>(editing?.id);
  const [busy, setBusy] = useState(false);
  // 編集対象が変わったら入力欄を作り直す
  const key = `${open}:${editing?.id ?? "new"}`;
  if (prevKey !== key) {
    setPrevKey(key);
    setV(toInput(editing));
  }
  const set = <K extends keyof CustomExerciseInput>(k: K, val: CustomExerciseInput[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await updateCustomExercise(editing.id, v);
        toast("種目を更新しました", "success");
        onSaved?.(null);
      } else {
        const def = await addCustomExercise(v);
        toast(`${def.name} を作成しました`, "success");
        onSaved?.(def);
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存できませんでした", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "種目を編集" : "新しい種目を作る"}
      footer={
        <button type="button" className="btn-primary mb-1 w-full py-3" disabled={busy || !v.name.trim()} onClick={save} data-testid="custom-ex-save">
          {busy ? "保存中…" : editing ? "保存" : "作成"}
        </button>
      }
    >
      <div className="space-y-4 text-sm" data-testid="custom-ex-form">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">種目名</span>
          <input className="input" maxLength={30} placeholder="例：ケーブルクランチ" value={v.name} onChange={(e) => set("name", e.target.value)} aria-label="種目名" data-testid="custom-ex-name" />
        </label>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">記録の仕方</div>
          <ChipGroup
            label="記録の仕方"
            options={[
              { value: "weight" as const, label: "重量×回数" },
              { value: "reps" as const, label: "回数のみ" },
              { value: "time" as const, label: "時間（秒）" },
            ]}
            value={v.loadType}
            onChange={(x) => set("loadType", x)}
            columns={3}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">器具</span>
          <select className="input" value={v.equipmentId} onChange={(e) => set("equipmentId", e.target.value)} aria-label="器具">
            {EQUIPMENT.filter((e) => e.category !== "cardio").map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">「ダンベル」はダンベルの時間として集計されます。マシンが一覧に無いときは「その他の器具・マシン」を選んでください。</span>
        </label>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">鍛える部位（複数選択）</div>
          <MultiChipGroup label="鍛える部位" options={MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABEL[m] }))} value={v.primary} onChange={(x) => set("primary", x)} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.unilateral} onChange={(e) => set("unilateral", e.target.checked)} />
          片手・片脚で行う（左右別に記録）
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="セット数">
            <NumberField label="セット数" unit="セット" value={v.defaultSets} onChange={(n) => set("defaultSets", n ?? 3)} step={1} min={1} max={10} decimals={0} size="sm" className="w-full" />
          </Field>
          {v.loadType === "time" ? (
            <Field label="1セットの秒数">
              <NumberField label="1セットの秒数" unit="秒" value={v.defaultSeconds} onChange={(n) => set("defaultSeconds", n)} step={5} min={5} max={600} decimals={0} size="sm" className="w-full" />
            </Field>
          ) : (
            <Field label="目標回数">
              <NumberField label="目標回数" unit="回" value={v.defaultReps} onChange={(n) => set("defaultReps", n)} step={1} min={1} max={100} decimals={0} size="sm" className="w-full" />
            </Field>
          )}
          {v.loadType === "weight" && (
            <Field label="重量の刻み">
              <NumberField label="重量の刻み" unit="kg" value={v.increment} onChange={(n) => set("increment", n ?? 2.5)} step={0.5} min={0.5} max={20} size="sm" className="w-full" />
            </Field>
          )}
          <Field label="休憩（休憩タイマー）">
            <NumberField label="休憩の秒数" unit="秒" value={v.restSec} onChange={(n) => set("restSec", n ?? 60)} step={15} min={0} max={600} decimals={0} size="sm" className="w-full" />
          </Field>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">フォームのメモ（任意・1行ずつ）</span>
          <textarea className="input min-h-20" value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder={"例：肘を固定する\n反動を使わない"} aria-label="フォームのメモ" />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={v.autoMenu} onChange={(e) => set("autoMenu", e.target.checked)} data-testid="custom-ex-auto" />
          <span>
            メニューの自動作成に含める
            <span className="block text-[11px] text-muted">オフなら、トレーニング中に「種目を追加」から手動で入れたときだけ使います。</span>
          </span>
        </label>
      </div>
    </Sheet>
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
