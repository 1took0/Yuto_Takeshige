"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useActiveWorkout } from "./ActiveWorkoutProvider";
import { ProgressBar } from "./ProgressBar";
import { ExerciseCard } from "./ExerciseCard";
import { CardioCard } from "./CardioCard";
import { AddExerciseSheet } from "./AddExerciseSheet";
import { RestTimerBar } from "@/components/timer/RestTimerBar";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { useSettings } from "@/hooks/useSettings";
import { addCardio, addExercise, finalizeWorkout, insertExercise, moveItemTo, orderedItems, progressOf } from "@/lib/workout/edit";
import { useLongPressReorder } from "./useLongPressReorder";
import { useLiveQuery } from "dexie-react-hooks";
import { listCompletedWorkouts, listStoreEquipment, setStoreEquipment } from "@/lib/db/repo";
import { planSingleExercise } from "@/lib/planner";
import { getExercise } from "@/lib/catalog/exercises";
import { stepFor } from "@/lib/planner/progression";
import { workoutStoreName } from "@/lib/catalog/stores";
import { formatJaDate, formatTimeHM } from "@/lib/date/trainingDay";
import { clearTimer } from "@/hooks/useTimer";
import { useToast } from "@/components/ui/Toast";
import { DurationEditor } from "./DurationEditor";
import type { WorkoutDurations } from "@/lib/types";
import { TrainingAdjust } from "@/components/adjust/TrainingAdjust";
import { TimerIcon } from "@/components/ui/Icons";

export function ActiveWorkoutView() {
  const { workout: w, loading, mutate, setWorkout, savedAt, saving } = useActiveWorkout();
  const { settings } = useSettings();
  const router = useRouter();
  const toast = useToast();
  const [collapsedState, setCollapsed] = useState<Record<string, boolean> | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [durDraft, setDurDraft] = useState<WorkoutDurations | undefined>(undefined);
  const [rest, setRest] = useState<{ sec: number; nonce: number } | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  const focusedId = w?.ui?.focusedExerciseId ?? null;
  // この店舗の器具ごとの重量の刻み
  const storeId = w?.storeId;
  const equipment = useLiveQuery(() => (storeId ? listStoreEquipment(storeId) : Promise.resolve([])), [storeId], []);
  const history = useLiveQuery(() => listCompletedWorkouts(), [], []);
  const progress = useMemo(() => (w ? progressOf(w) : null), [w]);
  // 種目・有酸素のカードを長押しして上下に動かすと並べ替える
  const items = useMemo(() => (w ? orderedItems(w) : []), [w]);
  const reorder = useLongPressReorder(
    items.map((it) => it.id),
    (id, to) => mutate((x) => moveItemTo(x, id, to)),
    !focusedId,
  );

  // 初期状態：最初の未完了種目と、その前にある未完了の有酸素（ウォームアップ）だけ開き、他は折りたたむ
  // （途中・最後の有酸素は、順番が来るまで閉じておく。ユーザー操作後は操作を優先）
  const collapsed = useMemo(() => {
    if (collapsedState) return collapsedState;
    const next: Record<string, boolean> = {};
    if (!w) return next;
    let openedEx = false;
    let openedCardio = false;
    for (const it of items) {
      if (it.kind === "exercise") {
        const e = w.exercises.find((x) => x.id === it.id)!;
        const done = e.status === "skipped" || (e.sets.length > 0 && e.sets.filter((s) => !s.excluded).every((s) => s.completed));
        next[it.id] = done || openedEx;
        if (!done && !openedEx) openedEx = true;
      } else {
        const c = w.cardio.find((x) => x.id === it.id)!;
        const done = c.completed || !!c.skipped;
        const open = !done && !openedCardio && !openedEx;
        next[it.id] = !open;
        if (open) openedCardio = true;
      }
    }
    return next;
  }, [collapsedState, w, items]);

  if (loading) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  if (!w || !progress) {
    return (
      <div className="space-y-4 py-6">
        <h1 className="text-2xl font-bold">トレーニング</h1>
        <div className="card p-5 text-center">
          <p className="text-muted">進行中のトレーニングはありません。</p>
          <Link href="/start" className="btn-primary mt-4 w-full text-lg">
            トレーニング開始
          </Link>
        </div>
      </div>
    );
  }

  const stepOf = (exerciseId: string) => {
    const def = getExercise(exerciseId);
    return def ? stepFor(def, w.storeId, equipment) : undefined;
  };
  // 集中モードではその種目だけ、ふだんは種目と有酸素を並び順どおりに表示
  const visibleItems = focusedId ? items.filter((it) => it.id === focusedId) : items;
  const toggleCollapse = (id: string) => setCollapsed({ ...collapsed, [id]: !collapsed[id] });
  const setFocus = (id: string | null) => {
    mutate((x) => ({ ...x, ui: { ...x.ui, focusedExerciseId: id } }));
    if (id) setCollapsed({ ...collapsed, [id]: false });
  };

  const finish = async () => {
    const done = finalizeWorkout({ ...w, durations: durDraft?.manual ? durDraft : undefined });
    await setWorkout(null);
    const { saveWorkout, rememberIntakeDefaults } = await import("@/lib/db/repo");
    await saveWorkout(done);
    if (w.intake) await rememberIntakeDefaults(w.intake.storeId, w.intake.timeLimitMin, w.intake.cardio);
    clearTimer("rest");
    clearTimer("bike");
    clearTimer("treadmill");
    toast("トレーニングを保存しました", "success");
    router.push(`/history/${done.id}?saved=1`);
  };

  const discard = async () => {
    const { deleteWorkout } = await import("@/lib/db/repo");
    await deleteWorkout(w.id);
    await setWorkout(null);
    clearTimer("rest");
    clearTimer("bike");
    clearTimer("treadmill");
    toast("トレーニングをキャンセルしました");
    router.push("/");
  };

  return (
    <div className="space-y-3 pb-24">
      <div className="sticky top-0 z-30 -mx-4 bg-bg/95 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>
            {formatJaDate(w.trainingDate)} {workoutStoreName(w, true)} ・ {formatTimeHM(w.startedAt)}〜
          </span>
          <span className="flex items-center gap-2">
            <span aria-live="polite">{saving ? "保存中…" : savedAt ? `保存済み ${formatTimeHM(savedAt)}` : "自動保存"}</span>
            <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-danger" onClick={() => setConfirmCancel(true)} data-testid="cancel-workout">
              キャンセル
            </button>
          </span>
        </div>
        <ProgressBar p={progress} compact={!!focusedId} />
      </div>

      {focusedId && (
        <button type="button" className="btn-secondary w-full" onClick={() => setFocus(null)}>
          ← すべての種目を表示
        </button>
      )}

      {visibleItems.map((it) => {
        if (it.kind === "cardio") {
          const c = w.cardio.find((x) => x.id === it.id);
          return c ? <CardioCard key={c.id} entry={c} mutate={mutate} timerLink dragItem={reorder.itemProps(c.id)} dragHandle={reorder.handleProps(c.id)} collapsed={!!collapsed[c.id]} onToggleCollapse={() => toggleCollapse(c.id)} /> : null;
        }
        const idx = w.exercises.findIndex((x) => x.id === it.id);
        const e = w.exercises[idx];
        if (!e) return null;
        return (
          <ExerciseCard
            key={e.id}
            exercise={e}
            index={idx}
            dragItem={focusedId ? undefined : reorder.itemProps(e.id)}
            dragHandle={focusedId ? undefined : reorder.handleProps(e.id)}
            step={stepOf(e.exerciseId)}
            onChangeStep={async (v) => {
              const def = getExercise(e.exerciseId);
              if (!def) throw new Error("種目が見つかりません");
              await setStoreEquipment(w.storeId, def.equipmentId, { stepKg: v });
            }}
            mutate={mutate}
            collapsed={!!collapsed[e.id] && !focusedId}
            focused={focusedId === e.id}
            onToggleCollapse={() => toggleCollapse(e.id)}
            onFocus={() => setFocus(focusedId === e.id ? null : e.id)}
            onStartRest={(sec) => {
              if (sec === null) {
                setRest(null);
                clearTimer("rest");
                return;
              }
              // 設定で休憩時間を決めていればそれを使い、なければ種目ごとの標準
              const s = settings?.restTimerSec ?? sec;
              if (s > 0) setRest((r) => ({ sec: s, nonce: (r?.nonce ?? 0) + 1 }));
            }}
          />
        );
      })}

      {!focusedId && (
        <>
          {w.exercises.length === 0 && w.cardio.length === 0 && (
            <p className="rounded-xl bg-card-2 p-3 text-sm text-muted" data-testid="manual-empty">
              まだ種目がありません。「＋ 種目を追加」「＋ 有酸素を追加」で、やった（やる）メニューを入力してください。
            </p>
          )}
          <button type="button" className="btn-secondary w-full" onClick={() => setShowAdd(true)} data-testid="add-exercise">
            ＋ 種目を追加
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => mutate((x) => addCardio(x, "treadmill"))} data-testid="add-cardio-treadmill">
              ＋ 有酸素を追加（トレッドミル）
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => mutate((x) => addCardio(x, "bike"))} data-testid="add-cardio-bike">
              ＋ 有酸素を追加（バイク）
            </button>
          </div>
          <div className="card p-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowAdjust((v) => !v)} aria-expanded={showAdjust}>
              <span className="font-semibold">トレーニングを調整（残り時間・疲れ・マシンなど）</span>
              <span className="text-muted">{showAdjust ? "▾" : "▸"}</span>
            </button>
            {showAdjust && (
              <div className="mt-2">
                <TrainingAdjust />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <button type="button" className="btn-primary w-full py-4 text-lg" onClick={() => {
                setDurDraft(finalizeWorkout(w).durations);
                setShowFinish(true);
              }}
              data-testid="finish">
              トレーニングを終了・保存
            </button>
            <Link href="/timer/interval" className="btn-secondary">
              <span className="inline-flex items-center gap-1.5">
                <TimerIcon className="h-5 w-5" />
                タイマー画面
              </span>
            </Link>
            <button type="button" className="btn-secondary text-danger" onClick={() => setConfirmCancel(true)}>
              トレーニングをキャンセル
            </button>
          </div>
        </>
      )}

      {rest && settings && <RestTimerBar seconds={rest.sec} nonce={rest.nonce} sound={settings.sound} vibration={settings.vibration} onClose={() => setRest(null)} />}

      <AddExerciseSheet open={showAdd} onClose={() => setShowAdd(false)} storeId={w.storeId} excludedIds={settings?.excludedExerciseIds} onAdd={(id) => {
          // 前回の記録と重量の進め方から重量・回数を入れて追加する（記録が無ければ空欄）
          const ex = planSingleExercise(id, { history: history ?? [], storeId: w.storeId, storeEquipment: equipment, settings, manual: w.manual || !w.intake });
          mutate((x) => (ex ? insertExercise(x, ex) : addExercise(x, id)));
        }} />

      <ConfirmDialog
        open={confirmCancel}
        title="トレーニングをキャンセルしますか？"
        message="今日のメニューと、ここまでの記録は保存されずに削除されます。"
        confirmLabel="キャンセルする"
        danger
        onConfirm={discard}
        onClose={() => setConfirmCancel(false)}
      />

      <Sheet open={showFinish} onClose={() => setShowFinish(false)} title="トレーニングを終了">
        <div className="space-y-3 text-sm">
          <p>
            完了セット <b className="tabular">{progress.doneSets}</b> / {progress.plannedSets}、種目 <b className="tabular">{progress.doneExercises}</b> / {progress.totalExercises}
          </p>
          {progress.plannedSets - progress.doneSets > 0 && <p className="rounded-lg bg-warn-soft p-2 text-warn">未完了のセットが {progress.plannedSets - progress.doneSets} 件あります。これらは「未実施」として記録から除外されます（保存後に履歴から修正できます）。</p>}
          {w.cardio.some((c) => !c.completed && !c.skipped) && <p className="rounded-lg bg-card-2 p-2 text-muted">未完了の有酸素があります。実施した場合は各カードで実績を入力して「完了にする」を押してください。</p>}
          <div className="rounded-xl bg-card-2 p-3">
            <div className="mb-2 text-xs font-semibold text-muted">トレーニング時間（自動計算・修正できます）</div>
            <DurationEditor value={durDraft} onChange={setDurDraft} />
          </div>
          <button type="button" className="btn-primary w-full py-4 text-lg" onClick={finish} data-testid="finish-confirm">
            保存して終了
          </button>
          <button type="button" className="btn-secondary w-full" onClick={() => setShowFinish(false)}>
            トレーニングに戻る
          </button>
          <button type="button" className="btn-danger w-full" onClick={discard}>
            このトレーニングを破棄する
          </button>
        </div>
      </Sheet>
    </div>
  );
}
