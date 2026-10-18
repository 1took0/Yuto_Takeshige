"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useSettings } from "@/hooks/useSettings";
import { useActiveWorkout } from "@/components/workout/ActiveWorkoutProvider";
import { createTimer, restTimer, start as startNow, type TimerSegment } from "@/lib/timer/engine";
import { releaseWakeLock, requestWakeLock, supportsVibration, supportsWakeLock, unlockAudio } from "@/lib/timer/notify";
import { formatDuration } from "@/lib/date/trainingDay";
import type { CardioEntry, CardioMachine, CardioSegment } from "@/lib/types";
import { bikeWarmup, buildTreadmillPlan, planRunMin, planTotalMin } from "@/lib/planner/cardio";
import { NumberField } from "@/components/ui/NumberField";

type Machine = CardioMachine | "rest";

function toTimerSegments(plan: CardioSegment[]): TimerSegment[] {
  return plan.map((s) => ({ id: s.id, label: s.label ?? s.kind, kind: s.kind, durationSec: s.durationSec, speedKmh: s.speedKmh, speedMaxKmh: s.speedMaxKmh, inclinePct: s.inclinePct, level: s.level }));
}

const KIND_LABEL: Record<string, string> = { walk: "ウォーキング", run: "ランニング", bike: "バイク", cooldown: "クールダウン", warmup: "ウォームアップ", rest: "休憩", work: "運動" };

export function IntervalTimerView({ machine, entryId }: { machine: Machine; entryId?: string }) {
  const { settings, update } = useSettings();
  const { workout, mutate } = useActiveWorkout();
  const router = useRouter();
  const entry: CardioEntry | undefined = useMemo(() => workout?.cardio.find((c) => c.id === entryId), [workout, entryId]);
  const [customMin, setCustomMin] = useState<number | undefined>(machine === "rest" ? 1.5 : machine === "bike" ? 5 : 15);
  const [wakeActive, setWakeActive] = useState(false);

  const timerId = machine;
  const factory = () => {
    if (entry && entry.plan.length) return createTimer(timerId, machine === "bike" ? "エアロバイク" : "トレッドミル", toTimerSegments(entry.plan));
    if (machine === "rest") return restTimer("rest", 90);
    if (machine === "bike") return createTimer("bike", "エアロバイク", toTimerSegments(bikeWarmup(5).plan));
    return createTimer("treadmill", "トレッドミル", toTimerSegments(buildTreadmillPlan("walk", 15)));
  };
  const t = useTimer(timerId, factory, { sound: settings.sound, vibration: settings.vibration });

  // ワークアウトの計画と紐づく場合、タイマーの区間が計画と異なれば（idle のときだけ）差し替える
  useEffect(() => {
    if (!entry || !entry.plan.length) return;
    if (t.state.status !== "idle") return;
    const same = t.state.segments.length === entry.plan.length && t.state.segments.every((s, i) => s.id === entry.plan[i].id && s.durationSec === entry.plan[i].durationSec);
    if (!same) t.replace(createTimer(timerId, machine === "bike" ? "エアロバイク" : "トレッドミル", toTimerSegments(entry.plan)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, entry?.plan.length]);

  // Wake Lock（画面消灯防止）
  useEffect(() => {
    if (!settings.keepAwake || t.state.status !== "running") {
      releaseWakeLock();
      return;
    }
    let active = true;
    requestWakeLock().then((ok) => active && setWakeActive(ok));
    const onVis = () => {
      if (document.visibilityState === "visible" && t.state.status === "running") requestWakeLock().then((ok) => active && setWakeActive(ok));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVis);
      releaseWakeLock();
    };
  }, [settings.keepAwake, t.state.status]);

  const v = t.view;
  const seg = v.segment;
  const running = t.state.status === "running";
  const isRun = seg?.kind === "run";
  const color = isRun ? "text-run" : seg?.kind === "bike" ? "text-accent" : seg?.kind === "rest" ? "text-warn" : "text-walk";
  const bg = isRun ? "bg-run/10" : seg?.kind === "bike" ? "bg-accent-soft" : seg?.kind === "rest" ? "bg-warn-soft" : "bg-walk/10";

  const startPlan = (segments: TimerSegment[], title: string) => {
    unlockAudio();
    t.replace(startNow(createTimer(timerId, title, segments)));
  };

  const applyActual = () => {
    if (!entry) return;
    const total = planTotalMin(entry.plan);
    const run = planRunMin(entry.plan);
    mutate((w) => ({
      ...w,
      cardio: w.cardio.map((c) =>
        c.id === entry.id
          ? {
              ...c,
              completed: true,
              actual: {
                ...c.actual,
                totalMin: Math.round(total),
                runMin: run || c.actual?.runMin,
                runSpeedKmh: entry.plan.find((s) => s.kind === "run")?.speedKmh ?? c.actual?.runSpeedKmh,
                longestRunMin: run ? Math.max(...entry.plan.filter((s) => s.kind === "run").map((s) => s.durationSec / 60)) : c.actual?.longestRunMin,
              },
            }
          : c,
      ),
    }));
    router.push("/workout");
  };

  const title = machine === "rest" ? "休憩タイマー" : machine === "bike" ? "エアロバイク" : "トレッドミル";

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-3">
      <header className="flex items-center gap-2">
        <Link href={workout ? "/workout" : "/"} className="btn-ghost -ml-3 px-3" aria-label="戻る">
          ←
        </Link>
        <h1 className="text-xl font-bold">{title}</h1>
        <nav className="ml-auto flex gap-1 text-xs">
          {(["rest", "bike", "treadmill"] as Machine[]).map((m) => (
            <Link key={m} href={`/timer/${m}`} className={`chip px-3 py-1 ${m === machine ? "" : ""}`} data-selected={m === machine}>
              {m === "rest" ? "休憩" : m === "bike" ? "バイク" : "トレッドミル"}
            </Link>
          ))}
        </nav>
      </header>

      {/* メイン表示 */}
      <section className={`card flex flex-1 flex-col items-center justify-center gap-2 p-5 text-center ${bg}`} data-testid="timer-main" aria-live="polite">
        {v.finished ? (
          <>
            <div className="text-2xl font-bold text-success">終了！お疲れさまでした</div>
            <div className="text-muted">合計 {formatDuration(v.totalSec)}</div>
          </>
        ) : (
          <>
            <div className={`text-xl font-bold ${color}`}>{seg ? `${KIND_LABEL[seg.kind] ?? seg.label}${running ? "中" : ""}` : "—"}</div>
            <div className="text-xs text-muted">残り</div>
            <div className="text-[64px] font-bold leading-none tabular" data-testid="segment-remaining">
              {formatDuration(v.segmentRemainingSec)}
            </div>
            {seg && (seg.speedKmh !== undefined || seg.level !== undefined) && (
              <div className="mt-2 text-lg">
                {seg.level !== undefined ? (
                  <span>
                    負荷：<b>L{seg.level}</b>
                  </span>
                ) : (
                  <>
                    <span>
                      速度：<b>{seg.speedKmh?.toFixed(1)}{seg.speedMaxKmh ? `〜${seg.speedMaxKmh.toFixed(1)}` : ""}km/h</b>
                    </span>
                    <span className="ml-3">
                      傾斜：<b>{seg.inclinePct ?? 0}%</b>
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="mt-2 text-sm text-muted">{v.next ? `次：${KIND_LABEL[v.next.kind] ?? v.next.label} ${formatDuration(v.next.durationSec)}${v.next.speedKmh ? ` ${v.next.speedKmh}km/h` : ""}${v.next.level ? ` L${v.next.level}` : ""}` : "最後の区間"}</div>
          </>
        )}
        <div className="mt-3 w-full">
          <div className="flex justify-between text-xs text-muted tabular">
            <span>経過 {formatDuration(v.elapsedSec)}</span>
            <span>
              区間 {Math.min(v.index + 1, t.state.segments.length)}/{t.state.segments.length}
            </span>
            <span>残り {formatDuration(v.remainingSec)}</span>
          </div>
          <div className="mt-1 flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
            {t.state.segments.map((s, i) => {
              const fill = i < v.index ? 1 : i === v.index ? (s.durationSec ? v.segmentElapsedSec / s.durationSec : 1) : 0;
              return (
                <div key={s.id} className="relative h-full bg-card-2" style={{ flex: s.durationSec }}>
                  <div className={`absolute inset-y-0 left-0 ${s.kind === "run" ? "bg-run" : s.kind === "bike" ? "bg-accent" : s.kind === "rest" ? "bg-warn" : "bg-walk"}`} style={{ width: `${Math.min(100, fill * 100)}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 操作 */}
      <section className="grid grid-cols-4 gap-2">
        <button
          type="button"
          className={`col-span-2 py-5 text-xl ${running ? "btn-secondary" : "btn-primary"}`}
          onClick={() => {
            unlockAudio();
            t.toggle();
          }}
          disabled={v.finished}
          data-testid="timer-toggle"
        >
          {t.state.status === "idle" ? "▶ 開始" : running ? "❚❚ 一時停止" : "▶ 再開"}
        </button>
        <button type="button" className="btn-secondary py-5" onClick={t.skip} disabled={v.finished || t.state.status === "idle"} aria-label="次の区間へ">
          ⏭
        </button>
        <button type="button" className="btn-secondary py-5" onClick={t.reset} aria-label="リセット" data-testid="timer-reset">
          ↺
        </button>
      </section>
      <section className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => t.adjust(30)}>
          区間 +30秒
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => t.adjust(-30)}>
          区間 −30秒
        </button>
        {entry && v.finished && (
          <button type="button" className="btn-primary ml-auto px-3 py-1.5" onClick={applyActual}>
            計画どおり実施 → 実績に反映
          </button>
        )}
      </section>

      {/* 区間一覧 */}
      <section className="card p-3">
        <div className="mb-1 text-xs font-semibold text-muted">区間</div>
        <ul className="divide-y divide-border text-sm">
          {t.state.segments.map((s, i) => (
            <li key={s.id} className={`flex items-center justify-between py-1 ${i === v.index && !v.finished ? "font-bold" : i < v.index ? "text-muted line-through" : ""}`}>
              <span>
                {i + 1}. {KIND_LABEL[s.kind] ?? s.label}
              </span>
              <span className="tabular">
                {s.level !== undefined ? `L${s.level}` : s.speedKmh !== undefined ? `${s.speedKmh}km/h ${s.inclinePct ?? 0}%` : ""} ・ {formatDuration(s.durationSec)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* プリセット */}
      {!entry && (
        <section className="card space-y-2 p-3">
          <div className="text-xs font-semibold text-muted">プリセット（開始すると現在のタイマーを置き換えます）</div>
          <div className="flex flex-wrap items-center gap-2">
            {machine === "rest" && (
              <>
                {[60, 90, 120, 180].map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => startPlan(restTimer("rest", s).segments, "休憩")}>
                    {s}秒
                  </button>
                ))}
              </>
            )}
            {machine === "bike" && (
              <>
                {[5, 6, 7, 10].map((m) => (
                  <button key={m} type="button" className="chip" onClick={() => startPlan(toTimerSegments(bikeWarmup(m).plan), "エアロバイク")}>
                    {m}分（L15→L20）
                  </button>
                ))}
              </>
            )}
            {machine === "treadmill" && (
              <>
                <button type="button" className="chip" onClick={() => startPlan(toTimerSegments(buildTreadmillPlan("walk", 15)), "トレッドミル")}>
                  ウォーク15分
                </button>
                <button type="button" className="chip" onClick={() => startPlan(toTimerSegments(buildTreadmillPlan("walk", 25)), "トレッドミル")}>
                  ウォーク25分
                </button>
                <button type="button" className="chip" onClick={() => startPlan(toTimerSegments(buildTreadmillPlan("run", 25, { speedKmh: 12, totalRunMin: 10, intervalMin: 2, rationale: "" })), "トレッドミル")}>
                  ラン 12km/h 2分×5
                </button>
                <button type="button" className="chip" onClick={() => startPlan(toTimerSegments(buildTreadmillPlan("run", 25, { speedKmh: 12, totalRunMin: 12, intervalMin: 3, rationale: "" })), "トレッドミル")}>
                  ラン 12km/h 3分×4
                </button>
              </>
            )}
            <span className="ml-auto flex items-center gap-1 text-xs text-muted">
              任意
              <NumberField label="任意の分数" unit="分" value={customMin} onChange={setCustomMin} step={machine === "rest" ? 0.5 : 1} max={120} size="sm" className="w-28" />
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => {
                  const m = customMin ?? 1;
                  if (machine === "rest") startPlan(restTimer("rest", Math.round(m * 60)).segments, "休憩");
                  else if (machine === "bike") startPlan(toTimerSegments(bikeWarmup(m).plan), "エアロバイク");
                  else startPlan(toTimerSegments(buildTreadmillPlan("walk", m)), "トレッドミル");
                }}
              >
                開始
              </button>
            </span>
          </div>
        </section>
      )}

      {/* 通知設定と制約 */}
      <section className="card space-y-2 p-3 text-xs text-muted">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} /> 音
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={settings.vibration} onChange={(e) => update({ vibration: e.target.checked })} /> 振動{!supportsVibration() && "（この端末は非対応）"}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={settings.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} /> 画面を消灯しない{supportsWakeLock() ? (wakeActive && running ? "（有効）" : "") : "（非対応）"}
          </label>
          <button type="button" className="underline" onClick={() => { unlockAudio(); t.testBeep(); }}>
            音をテスト
          </button>
        </div>
        <p>
          iPhone の Safari / ホーム画面アプリでは、画面がスリープしたりアプリが裏に回ると音や振動は鳴りません（iOS の制約）。区間の切り替えを見逃さないために「画面を消灯しない」を有効にし、トレッドミルのホルダーに置いて画面を表示したままにしてください。スリープしても再表示時に経過時間は正しく復元されます。
        </p>
      </section>
    </div>
  );
}
