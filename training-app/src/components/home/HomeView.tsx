"use client";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useActiveWorkout } from "@/components/workout/ActiveWorkoutProvider";
import { listCompletedWorkouts } from "@/lib/db/repo";
import { workoutStoreName } from "@/lib/catalog/stores";
import { diffDays, formatJaDate, trainingDateOf } from "@/lib/date/trainingDay";
import { progressOf } from "@/lib/workout/edit";
import { TrainingAdjust } from "@/components/adjust/TrainingAdjust";
import { countedSets } from "@/lib/planner/history";

export function HomeView() {
  const { workout: active } = useActiveWorkout();
  const history = useLiveQuery(() => listCompletedWorkouts(), [], []);
  const last = history[0];
  const today = trainingDateOf();
  const restDays = last ? diffDays(today, last.trainingDate) : null;
  const weekCount = history.filter((w) => diffDays(today, w.trainingDate) < 7).length;

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">トレーニングコーチ</h1>
        <p className="text-sm text-muted">{formatJaDate(today)}（6時区切り）</p>
      </header>

      {active ? (
        <Link href="/workout" className="card block border-success p-4" data-testid="resume">
          <div className="text-xs font-semibold text-success">進行中のトレーニング</div>
          <div className="mt-1 text-lg font-bold">
            {workoutStoreName(active, true)} ・ {progressOf(active).doneSets}/{progressOf(active).plannedSets} セット完了
          </div>
          <div className="mt-2 text-sm text-accent">タップして再開 →</div>
        </Link>
      ) : (
        <div className="space-y-2">
          <Link href="/start" className="btn-primary w-full py-5 text-xl" data-testid="start">
            トレーニング開始
          </Link>
          <Link href="/start?manual=1" className="btn-secondary w-full" data-testid="manual-start">
            メニューを自分で入力して記録
          </Link>
        </div>
      )}

      <section className="card p-3">
        <h2 className="mb-2 text-sm font-semibold text-muted">トレーニングを調整</h2>
        <TrainingAdjust />
        <p className="mt-2 text-[11px] text-muted">トレーニング中は、トレーニング画面の「トレーニングを調整」から残り時間・疲れている部位なども選べます。</p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="最終トレ" value={last ? `${restDays}日前` : "—"} sub={last ? formatJaDate(last.trainingDate) : ""} />
        <Stat label="直近7日" value={`${weekCount}回`} sub="トレーニング" />
        <Stat label="記録数" value={`${history.length}回`} sub="合計" />
      </section>

      {last && (
        <section className="card p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">前回：{formatJaDate(last.trainingDate)}・{workoutStoreName(last, true)}</h2>
            <Link href={`/history/${last.id}`} className="text-sm text-accent">
              詳細 →
            </Link>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {last.exercises.slice(0, 6).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">{e.name}</span>
                <span className="shrink-0 tabular text-muted">
                  {countedSets(e)
                    .map((s) => (s.weight !== undefined ? s.weight : s.seconds !== undefined ? `${s.seconds}s` : "?"))
                    .join("/")}
                </span>
              </li>
            ))}
            {last.exercises.length > 6 && <li className="text-xs text-muted">他 {last.exercises.length - 6} 種目</li>}
          </ul>
        </section>
      )}

      <Link href="/timer/interval" className="btn-secondary w-full">
        ⏱ タイマー
      </Link>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-lg font-bold tabular">{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}
