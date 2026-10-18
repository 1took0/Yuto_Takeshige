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
import { Sheet } from "@/components/ui/Sheet";
import { useSettings } from "@/hooks/useSettings";
import { addExercise, finalizeWorkout, progressOf } from "@/lib/workout/edit";
import { workoutStoreName } from "@/lib/catalog/stores";
import { formatJaDate, formatTimeHM } from "@/lib/date/trainingDay";
import { clearTimer } from "@/hooks/useTimer";
import { useToast } from "@/components/ui/Toast";
import { CoachInput } from "@/components/coach/CoachInput";

export function ActiveWorkoutView() {
  const { workout: w, loading, mutate, setWorkout, savedAt, saving } = useActiveWorkout();
  const { settings } = useSettings();
  const router = useRouter();
  const toast = useToast();
  const [collapsedState, setCollapsed] = useState<Record<string, boolean> | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [rest, setRest] = useState<{ sec: number; nonce: number } | null>(null);
  const [showCoach, setShowCoach] = useState(false);

  const focusedId = w?.ui?.focusedExerciseId ?? null;
  const progress = useMemo(() => (w ? progressOf(w) : null), [w]);

  // 初期状態：最初の未完了種目だけ開き、他は折りたたむ（ユーザー操作後は操作を優先）
  const collapsed = useMemo(() => {
    if (collapsedState) return collapsedState;
    const next: Record<string, boolean> = {};
    if (!w) return next;
    let opened = false;
    for (const e of w.exercises) {
      const done = e.status === "skipped" || (e.sets.length > 0 && e.sets.filter((s) => !s.excluded).every((s) => s.completed));
      next[e.id] = done || opened;
      if (!done && !opened) opened = true;
    }
    return next;
  }, [collapsedState, w]);

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

  const visibleExercises = focusedId ? w.exercises.filter((e) => e.id === focusedId) : w.exercises;
  const toggleCollapse = (id: string) => setCollapsed({ ...collapsed, [id]: !collapsed[id] });
  const setFocus = (id: string | null) => {
    mutate((x) => ({ ...x, ui: { ...x.ui, focusedExerciseId: id } }));
    if (id) setCollapsed({ ...collapsed, [id]: false });
  };

  const finish = async () => {
    const done = finalizeWorkout(w);
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
    router.push("/");
  };

  return (
    <div className="space-y-3 pb-24">
      <div className="sticky top-0 z-30 -mx-4 bg-bg/95 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>
            {formatJaDate(w.trainingDate)} {workoutStoreName(w, true)} ・ {formatTimeHM(w.startedAt)}〜
          </span>
          <span aria-live="polite">{saving ? "保存中…" : savedAt ? `保存済み ${formatTimeHM(savedAt)}` : "自動保存"}</span>
        </div>
        <ProgressBar p={progress} compact={!!focusedId} />
      </div>

      {focusedId && (
        <button type="button" className="btn-secondary w-full" onClick={() => setFocus(null)}>
          ← すべての種目を表示
        </button>
      )}

      {!focusedId && w.cardio.filter((c) => c.role === "warmup").map((c) => <CardioCard key={c.id} entry={c} mutate={mutate} timerLink />)}

      {visibleExercises.map((e) => {
        const idx = w.exercises.findIndex((x) => x.id === e.id);
        return (
          <ExerciseCard
            key={e.id}
            exercise={e}
            index={idx}
            total={w.exercises.length}
            mutate={mutate}
            collapsed={!!collapsed[e.id] && !focusedId}
            focused={focusedId === e.id}
            onToggleCollapse={() => toggleCollapse(e.id)}
            onFocus={() => setFocus(focusedId === e.id ? null : e.id)}
            onStartRest={(sec) => setRest((r) => ({ sec, nonce: (r?.nonce ?? 0) + 1 }))}
          />
        );
      })}

      {!focusedId && (
        <>
          <button type="button" className="btn-secondary w-full" onClick={() => setShowAdd(true)} data-testid="add-exercise">
            ＋ 種目を追加
          </button>
          {w.cardio.filter((c) => c.role === "main").map((c) => <CardioCard key={c.id} entry={c} mutate={mutate} timerLink />)}
          <div className="card p-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowCoach((v) => !v)} aria-expanded={showCoach}>
              <span className="font-semibold">💬 コーチに相談（「あと20分しかない」「このマシンがない」など）</span>
              <span className="text-muted">{showCoach ? "▾" : "▸"}</span>
            </button>
            {showCoach && (
              <div className="mt-2">
                <CoachInput compact />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <button type="button" className="btn-primary w-full py-4 text-lg" onClick={() => setShowFinish(true)} data-testid="finish">
              トレーニングを終了・保存
            </button>
            <Link href="/timer/rest" className="btn-secondary">
              ⏱ タイマー画面
            </Link>
          </div>
        </>
      )}

      {rest && settings && <RestTimerBar seconds={rest.sec} nonce={rest.nonce} sound={settings.sound} vibration={settings.vibration} onClose={() => setRest(null)} />}

      <AddExerciseSheet open={showAdd} onClose={() => setShowAdd(false)} storeId={w.storeId} excludedIds={settings?.excludedExerciseIds} onAdd={(id) => mutate((x) => addExercise(x, id))} />

      <Sheet open={showFinish} onClose={() => setShowFinish(false)} title="トレーニングを終了">
        <div className="space-y-3 text-sm">
          <p>
            完了セット <b className="tabular">{progress.doneSets}</b> / {progress.plannedSets}、種目 <b className="tabular">{progress.doneExercises}</b> / {progress.totalExercises}
          </p>
          {progress.plannedSets - progress.doneSets > 0 && <p className="rounded-lg bg-warn-soft p-2 text-warn">未完了のセットが {progress.plannedSets - progress.doneSets} 件あります。これらは「未実施」として記録から除外されます（保存後に履歴から修正できます）。</p>}
          {w.cardio.some((c) => !c.completed && !c.skipped) && <p className="rounded-lg bg-card-2 p-2 text-muted">未完了の有酸素があります。実施した場合は各カードで実績を入力して「完了にする」を押してください。</p>}
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
