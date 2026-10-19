"use client";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { StoreId } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { listStoreEquipment } from "@/lib/db/repo";
import { availableExercises } from "@/lib/planner";
import { musclesLabel, REGION_LABEL } from "@/lib/catalog/muscles";
import { useExercises } from "@/hooks/useSettings";
import { CustomExerciseForm } from "@/components/settings/CustomExerciseForm";
import { DeleteExerciseDialog } from "@/components/settings/CustomExerciseManager";
import { CloseIcon } from "@/components/ui/Icons";
import type { ExerciseDef } from "@/lib/types";

export function AddExerciseSheet({ open, onClose, storeId, onAdd, excludedIds = [] }: { open: boolean; onClose: () => void; storeId: StoreId; onAdd: (exerciseId: string) => void; excludedIds?: string[] }) {
  const equipment = useLiveQuery(() => listStoreEquipment(storeId), [storeId], []);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ExerciseDef | null>(null);
  const all = useExercises();
  const list = useMemo(() => {
    const avail = availableExercises(equipment, storeId, excludedIds);
    const items = showAll ? all.map((def) => ({ def, confirmed: avail.find((a) => a.def.id === def.id)?.confirmed ?? false, unavailable: !avail.some((a) => a.def.id === def.id) })) : avail.map((a) => ({ ...a, unavailable: false }));
    return items.filter((x) => !q || x.def.name.includes(q) || musclesLabel(x.def.primary).includes(q));
    }, [equipment, storeId, excludedIds, q, showAll, all]);
  return (
    <Sheet open={open} onClose={onClose} title="種目を追加">
      <button type="button" className="btn-secondary mb-2 w-full" onClick={() => setCreating(true)} data-testid="add-sheet-create">
        ＋ 一覧に無い種目を作る
      </button>
      <input className="input mb-2" placeholder="種目名・部位で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="種目検索" />
      <label className="mb-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        この店舗に無い器具の種目も表示
      </label>
      <ul className="divide-y divide-border">
        {list.map(({ def, confirmed, unavailable }) => (
          <li key={def.id} className="flex items-center gap-1">
            <button
              type="button"
              className="tap flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
              onClick={() => {
                onAdd(def.id);
                onClose();
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {def.name}
                  {unavailable && <span className="ml-1 rounded bg-danger-soft px-1 text-[10px] text-danger">器具なし</span>}
                  {!unavailable && !confirmed && <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] text-warn">未確認</span>}
                  {def.optional && <span className="ml-1 rounded bg-card-2 px-1 text-[10px] text-muted">導入候補</span>}
                  {def.custom && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] text-accent">自分の種目</span>}
                </div>
                <div className="text-xs text-muted">
                  {musclesLabel(def.primary)} ・ {def.regions.map((r) => REGION_LABEL[r]).join("/")}
                </div>
              </div>
              <span className="text-accent">＋</span>
            </button>
            <button type="button" className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-danger" aria-label={`${def.name}を一覧から削除`} onClick={() => setRemoving(def)}>
              <CloseIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-sm text-muted">該当する種目がありません</li>}
      </ul>
      <CustomExerciseForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(def) => {
          if (def) {
            onAdd(def.id);
            onClose();
          }
        }}
      />
      <DeleteExerciseDialog exercise={removing} onClose={() => setRemoving(null)} />
    </Sheet>
  );
}
