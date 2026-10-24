"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { deleteWorkout, getWorkout, listStoreEquipment, saveWorkout, setStoreEquipment } from "@/lib/db/repo";
import type { Workout } from "@/lib/types";
import { storeName, workoutStoreName } from "@/lib/catalog/stores";
import { useStores } from "@/hooks/useSettings";
import { formatJaDate, formatTimeHM } from "@/lib/date/trainingDay";
import { ExerciseCard } from "@/components/workout/ExerciseCard";
import { CardioCard } from "@/components/workout/CardioCard";
import { BikeIcon, RunIcon, TimerIcon } from "@/components/ui/Icons";
import { AddExerciseSheet } from "@/components/workout/AddExerciseSheet";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { addExercise, moveItemTo, orderedItems } from "@/lib/workout/edit";
import { useLongPressReorder } from "@/components/workout/useLongPressReorder";
import { getExercise } from "@/lib/catalog/exercises";
import { stepFor } from "@/lib/planner/progression";
import { countedSets } from "@/lib/planner/history";
import { useToast } from "@/components/ui/Toast";
import { DurationEditor } from "@/components/workout/DurationEditor";
import { formatDurations } from "@/lib/workout/duration";

export function WorkoutDetail({ id, justSaved }: { id: string; justSaved?: boolean }) {
  const fromDb = useLiveQuery(() => getWorkout(id), [id]);
  const stores = useStores();
  const [draft, setDraft] = useState<Workout | null>(null);
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const toast = useToast();
  const latest = useRef<Workout | null>(null);

  const startEditing = () => {
    if (!fromDb) return;
    latest.current = fromDb;
    setDraft(fromDb);
    setEditing(true);
  };
  const stopEditing = () => {
    setEditing(false);
    setDraft(null);
  };

  const mutate = useCallback(
    (fn: (w: Workout) => Workout) => {
      const cur = latest.current;
      if (!cur) return;
      const next = fn(cur);
      latest.current = next;
      setDraft(next);
      saveWorkout(next).catch((e) => console.error(e));
    },
    [],
  );
  // 編集中は種目・有酸素のカードを長押しして上下に動かすと並べ替える
  const equipmentStore = draft?.storeId ?? fromDb?.storeId;
  const equipment = useLiveQuery(() => (equipmentStore ? listStoreEquipment(equipmentStore) : Promise.resolve([])), [equipmentStore], []);
  const reorder = useLongPressReorder(draft ? orderedItems(draft).map((it) => it.id) : [], (itemId, to) => mutate((x) => moveItemTo(x, itemId, to)), editing);

  if (fromDb === undefined && !draft) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  const w = editing && draft ? draft : fromDb;
  if (!w) {
    return (
      <div className="py-10 text-center">
        <p className="text-muted">記録が見つかりません</p>
        <Link href="/history" className="btn-secondary mt-4">
          履歴へ
        </Link>
      </div>
    );
  }
  const totalSets = w.exercises.reduce((a, e) => a + countedSets(e).length, 0);

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <button type="button" className="btn-ghost -ml-3 px-3" onClick={() => router.push("/history")} aria-label="履歴へ戻る">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">
            {formatJaDate(w.trainingDate)} <span className="text-sm font-normal text-muted">{w.trainingDate.slice(0, 4)}</span>
          </h1>
          <div className="text-xs text-muted">
            {workoutStoreName(w)} ・ {w.timeOnly ? `時間だけの記録 ${formatTimeHM(w.startedAt)}〜${w.endedAt ? formatTimeHM(w.endedAt) : ""}` : `${w.exercises.length}種目 ${totalSets}セット`}{w.source === "import" && " ・ 取り込みデータ"}
          </div>
        </div>
        <button type="button" className={`btn-secondary px-3 ${editing ? "border-accent text-accent" : ""}`} onClick={() => (editing ? stopEditing() : startEditing())} data-testid="edit-toggle">
          {editing ? "編集を終了" : "修正する"}
        </button>
      </header>

      {justSaved && !editing && <div className="rounded-xl bg-success-soft p-3 text-sm text-success">保存しました。誤りがあれば「修正する」から編集できます（自動保存）。</div>}

      {editing && (
        <div className="card space-y-2 p-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted">日付</span>
            <input type="date" className="input" value={w.trainingDate} onChange={(e) => e.target.value && mutate((x) => ({ ...x, trainingDate: e.target.value }))} aria-label="トレーニング日" />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted">店舗</span>
            <select className="input" value={w.storeId} onChange={(e) => mutate((x) => ({ ...x, storeId: e.target.value as Workout["storeId"], storeLabel: storeName(e.target.value as Workout["storeId"]) }))} aria-label="店舗">
              {[...stores, ...(stores.some((s) => s.id === w.storeId) ? [] : [{ id: w.storeId, name: workoutStoreName(w), shortName: "" }])].map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1 text-muted">トレーニング時間</div>
            <DurationEditor value={w.durations} onChange={(d) => mutate((x) => ({ ...x, durations: d }))} />
          </div>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted">メモ</span>
            <input className="input" value={w.notes ?? ""} onChange={(e) => mutate((x) => ({ ...x, notes: e.target.value }))} aria-label="メモ" />
          </label>
        </div>
      )}
      {!editing && w.notes && <p className="rounded-xl bg-card-2 p-3 text-sm">{w.notes}</p>}
      {!editing && w.intake && (
        <p className="text-xs text-muted">
          体調 {w.intake.condition}/5・{w.intake.timeLimitMin ? `${w.intake.timeLimitMin}分` : "制限なし"}・有酸素 {w.intake.cardio === "run" ? "ランニング込み" : w.intake.cardio === "none" ? "なし" : "ウォーキング"}
          {w.intake.soreness && `・疲労あり`}
        </p>
      )}

      {editing ? (
        <>
          {orderedItems(w).map((it) => {
            if (it.kind === "cardio") {
              const c = w.cardio.find((x) => x.id === it.id);
              return c ? <CardioCard key={c.id} entry={c} mutate={mutate} dragItem={reorder.itemProps(c.id)} dragHandle={reorder.handleProps(c.id)} /> : null;
            }
            const i = w.exercises.findIndex((x) => x.id === it.id);
            const e = w.exercises[i];
            const def = getExercise(e?.exerciseId ?? "");
            return e ? <ExerciseCard key={e.id} exercise={e} index={i} step={def ? stepFor(def, w.storeId, equipment) : undefined} onChangeStep={(v) => def && void setStoreEquipment(w.storeId, def.equipmentId, { stepKg: v })} dragItem={reorder.itemProps(e.id)} dragHandle={reorder.handleProps(e.id)} mutate={mutate} collapsed={!!collapsed[e.id]} focused={false} onToggleCollapse={() => setCollapsed((c) => ({ ...c, [e.id]: !c[e.id] }))} onFocus={() => {}} editOnly /> : null;
          })}
          <button type="button" className="btn-secondary w-full" onClick={() => setShowAdd(true)}>
            ＋ 種目を追加
          </button>
          <button type="button" className="btn-danger w-full" onClick={() => setConfirmDelete(true)}>
            この記録を削除
          </button>
          <AddExerciseSheet open={showAdd} onClose={() => setShowAdd(false)} storeId={w.storeId} onAdd={(exId) => mutate((x) => addExercise(x, exId, { sets: 1 }))} />
        </>
      ) : (
        <ReadOnlyView w={w} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="この記録を削除しますか？"
        message="削除すると元に戻せません。"
        confirmLabel="削除"
        danger
        onConfirm={async () => {
          await deleteWorkout(w.id);
          toast("記録を削除しました");
          router.push("/history");
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export function ReadOnlyView({ w }: { w: Workout }) {
  const [showExcluded, setShowExcluded] = useState(false);
  const anyExcluded = w.exercises.some((e) => e.sets.some((s) => s.excluded || !s.completed));
  const dur = formatDurations(w.durations);
  return (
    <div className="space-y-2">
      {dur && (
        <p className="flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-sm" data-testid="durations">
          <TimerIcon className="h-4 w-4 shrink-0" />
          {dur}
        </p>
      )}
      {w.cardio.map((c) => (
        <div key={c.id} className="card p-3 text-sm">
          <div className="flex items-center gap-1.5 font-semibold">
            {c.machine === "bike" ? <BikeIcon className="h-4 w-4" /> : <RunIcon className="h-4 w-4" />}
            {c.machine === "bike" ? "エアロバイク" : "トレッドミル"} {c.skipped && <span className="text-xs text-muted">（実施せず）</span>}
          </div>
          <div className="text-muted">
            {c.actual?.totalMin !== undefined && `${c.actual.totalMin}分`}
            {c.actual?.level !== undefined && ` L${c.actual.level}`}
            {c.actual?.runMin !== undefined && ` ・ 走行${c.actual.runMin}分`}
            {c.actual?.runSpeedKmh !== undefined && ` ${c.actual.runSpeedKmh}km/h`}
            {c.actual?.distanceKm !== undefined && ` ・ ${c.actual.distanceKm}km`}
            {c.actual?.note && ` ・ ${c.actual.note}`}
            {!c.actual?.totalMin && !c.actual?.note && !c.skipped && (c.plan.length ? "（実績未入力。計画のみ）" : "（詳細未記録）")}
          </div>
        </div>
      ))}
      {w.exercises.map((e) => {
        const sets = e.sets.filter((s) => showExcluded || (s.completed && !s.excluded));
        if (!sets.length && !showExcluded) return null;
        return (
          <div key={e.id} className="card p-3 text-sm" data-testid="detail-exercise">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold">{e.name}</div>
              <div className="text-xs text-muted">{countedSets(e).length}セット</div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {sets.map((s, i) => (
                <span key={s.id} className={`rounded-lg px-2 py-1 tabular ${s.completed && !s.excluded ? "bg-card-2" : "bg-card-2 opacity-50 line-through"}`}>
                  {s.left || s.right
                    ? `L${s.left?.weight ?? "?"}/R${s.right?.weight ?? "?"}kg${s.left?.actualReps !== undefined ? ` ${s.left.actualReps}/${s.right?.actualReps ?? "?"}回` : ""}`
                    : s.seconds !== undefined || s.actualSeconds !== undefined
                      ? `${s.actualSeconds ?? s.seconds}秒`
                      : `${s.weight !== undefined ? `${s.weight}kg` : "重量不明"}${s.actualReps !== undefined ? `×${s.actualReps}回` : ""}`}
                  {s.feel && <span className="ml-1 text-[10px] text-muted">{s.feel === "easy" ? "楽" : s.feel === "ok" ? "適正" : "きつい"}</span>}
                  {i === 0 && s.note && <span className="ml-1 text-[10px] text-muted">{s.note}</span>}
                </span>
              ))}
            </div>
            {e.note && <div className="mt-1 text-xs text-muted">{e.note}</div>}
          </div>
        );
      })}
      {anyExcluded && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} /> 未実施・除外セットも表示
        </label>
      )}
    </div>
  );
}
