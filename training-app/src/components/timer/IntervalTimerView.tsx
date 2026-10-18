"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { saveTimer, useTimer } from "@/hooks/useTimer";
import { useSettings } from "@/hooks/useSettings";
import { useActiveWorkout } from "@/components/workout/ActiveWorkoutProvider";
import { createTimer, type TimerSegment } from "@/lib/timer/engine";
import { releaseWakeLock, requestWakeLock, supportsVibration, supportsWakeLock, unlockAudio } from "@/lib/timer/notify";
import { formatDuration } from "@/lib/date/trainingDay";
import type { CardioEntry, CardioSegment } from "@/lib/types";
import { bikeWarmup, buildTreadmillPlan, planRunMin, planTotalMin } from "@/lib/planner/cardio";
import { NumberField } from "@/components/ui/NumberField";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { deleteTimerHistory, getTimerHistory, recordTimerUse } from "@/lib/db/repo";
import { TIMER_TYPE_LABEL, autoTitle, buildCountdown, buildInterval, historySegments, parseInterval, type IntervalConfig, type TimerHistoryEntry, type TimerType } from "@/lib/timer/presets";

function toTimerSegments(plan: CardioSegment[]): TimerSegment[] {
  return plan.map((s) => ({ id: s.id, label: s.label ?? s.kind, kind: s.kind, durationSec: s.durationSec, speedKmh: s.speedKmh, speedMaxKmh: s.speedMaxKmh, inclinePct: s.inclinePct, level: s.level }));
}

const KIND_LABEL: Record<string, string> = { walk: "ウォーキング", run: "ランニング", bike: "バイク", cooldown: "クールダウン", warmup: "準備", rest: "休憩", work: "運動" };
const TYPES: TimerType[] = ["interval", "countdown", "bike", "treadmill"];
const DEFAULT_INTERVAL: IntervalConfig = { prepSec: 5, workSec: 40, restSec: 20, rounds: 8 };

function segLabel(s: TimerSegment | undefined): string {
  if (!s) return "—";
  if (s.kind === "work" || s.kind === "rest" || s.kind === "warmup") return s.label || KIND_LABEL[s.kind];
  return KIND_LABEL[s.kind] ?? s.label;
}

export function IntervalTimerView({ machine, entryId }: { machine: TimerType; entryId?: string }) {
  const { settings, update } = useSettings();
  const { workout, mutate } = useActiveWorkout();
  const router = useRouter();
  const entry: CardioEntry | undefined = useMemo(() => workout?.cardio.find((c) => c.id === entryId), [workout, entryId]);
  const [wakeActive, setWakeActive] = useState(false);
  const history = useLiveQuery(() => getTimerHistory(), [], []);
  const [pending, setPending] = useState<{ segments: TimerSegment[]; title: string; type: TimerType } | null>(null);
  const [name, setName] = useState("");

  const timerId = machine;
  const factory = () => {
    if (entry && entry.plan.length) return createTimer(timerId, machine === "bike" ? "エアロバイク" : "トレッドミル", toTimerSegments(entry.plan));
    if (machine === "interval") return createTimer("interval", autoTitle("interval", buildInterval(DEFAULT_INTERVAL)), buildInterval(DEFAULT_INTERVAL));
    if (machine === "countdown") return createTimer("countdown", "タイマー 01:30", buildCountdown(90));
    if (machine === "bike") return createTimer("bike", "エアロバイク", toTimerSegments(bikeWarmup(5).plan));
    return createTimer("treadmill", "トレッドミル", toTimerSegments(buildTreadmillPlan("walk", 15)));
  };
  const t = useTimer(timerId, factory, { sound: settings.sound, vibration: settings.vibration });

  // 編集欄（インターバル・通常タイマー）。現在のタイマーの設定を初期値にする
  const [intervalCfg, setIntervalCfg] = useState<IntervalConfig>(() => parseInterval(t.state.segments) ?? DEFAULT_INTERVAL);
  const [countMin, setCountMin] = useState<number | undefined>(() => Math.floor((t.state.segments[0]?.durationSec ?? 90) / 60));
  const [countSec, setCountSec] = useState<number | undefined>(() => (t.state.segments[0]?.durationSec ?? 90) % 60);

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
  const inProgress = t.state.status === "running" || (t.state.status === "paused" && v.elapsedSec > 0);
  const kind = seg?.kind;
  const color = kind === "run" || kind === "work" ? "text-run" : kind === "bike" ? "text-accent" : kind === "rest" ? "text-warn" : "text-walk";
  const bg = kind === "run" || kind === "work" ? "bg-run/10" : kind === "bike" ? "bg-accent-soft" : kind === "rest" ? "bg-warn-soft" : "bg-walk/10";

  /** タイマーをセットする（開始はしない）。別の種類なら、その画面へ移動 */
  const load = (type: TimerType, segments: TimerSegment[], title: string) => {
    const fresh = createTimer(type, title, segments);
    if (type === machine) {
      t.replace(fresh);
      if (type === "interval") setIntervalCfg(parseInterval(segments) ?? intervalCfg);
      if (type === "countdown") {
        setCountMin(Math.floor(segments[0].durationSec / 60));
        setCountSec(segments[0].durationSec % 60);
      }
    } else {
      saveTimer(fresh);
      router.push(`/timer/${type}`);
    }
  };
  const requestLoad = (type: TimerType, segments: TimerSegment[], title: string) => {
    // 動いている（または途中で止めた）タイマーを置き換えるときは確認する
    if (type === machine && inProgress) setPending({ type, segments, title });
    else load(type, segments, title);
  };

  const toggle = () => {
    unlockAudio();
    if (t.state.status === "idle") void recordTimerUse(machine, t.state.segments, name || undefined);
    t.toggle();
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

  const countTotal = (countMin ?? 0) * 60 + (countSec ?? 0);

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-3">
      <header className="flex items-center gap-2">
        <Link href={workout ? "/workout" : "/"} className="btn-ghost -ml-3 px-3" aria-label="戻る">
          ←
        </Link>
        <h1 className="truncate text-xl font-bold">{TIMER_TYPE_LABEL[machine]}</h1>
      </header>
      <nav className="grid grid-cols-4 gap-1 text-xs" aria-label="タイマーの種類">
        {TYPES.map((m) => (
          <Link key={m} href={`/timer/${m}`} className="chip whitespace-nowrap px-1 py-1.5 text-[11px]" data-selected={m === machine}>
            {TIMER_TYPE_LABEL[m]}
          </Link>
        ))}
      </nav>

      {/* メイン表示 */}
      <section className={`card flex flex-col items-center justify-center gap-2 p-5 text-center ${bg}`} data-testid="timer-main" aria-live="polite">
        {v.finished ? (
          <>
            <div className="text-2xl font-bold text-success">終了！お疲れさまでした</div>
            <div className="text-muted">合計 {formatDuration(v.totalSec)}</div>
          </>
        ) : (
          <>
            <div className={`text-xl font-bold ${color}`} data-testid="segment-label">
              {segLabel(seg)}
              {running && seg?.kind !== "rest" && seg?.kind !== "work" ? "中" : ""}
              {t.state.status === "idle" && <span className="ml-2 text-sm font-normal text-muted">（未スタート）</span>}
            </div>
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
            {t.state.segments.length > 1 && <div className="mt-2 text-sm text-muted">{v.next ? `次：${segLabel(v.next)} ${formatDuration(v.next.durationSec)}${v.next.speedKmh ? ` ${v.next.speedKmh}km/h` : ""}` : "最後の区間"}</div>}
          </>
        )}
        <div className="mt-3 w-full">
          <div className="flex justify-between text-xs text-muted tabular">
            <span>経過 {formatDuration(v.elapsedSec)}</span>
            {t.state.segments.length > 1 && (
              <span>
                区間 {Math.min(v.index + 1, t.state.segments.length)}/{t.state.segments.length}
              </span>
            )}
            <span>残り {formatDuration(v.remainingSec)}</span>
          </div>
          <div className="mt-1 flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
            {t.state.segments.map((s, i) => {
              const fill = i < v.index ? 1 : i === v.index ? (s.durationSec ? v.segmentElapsedSec / s.durationSec : 1) : 0;
              return (
                <div key={s.id} className="relative h-full bg-card-2" style={{ flex: s.durationSec }}>
                  <div className={`absolute inset-y-0 left-0 ${s.kind === "run" || s.kind === "work" ? "bg-run" : s.kind === "bike" ? "bg-accent" : s.kind === "rest" ? "bg-warn" : "bg-walk"}`} style={{ width: `${Math.min(100, fill * 100)}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 操作 */}
      <section className="grid grid-cols-4 gap-2">
        <button type="button" className={`col-span-2 py-5 text-xl ${running ? "btn-secondary" : "btn-primary"}`} onClick={toggle} disabled={v.finished} data-testid="timer-toggle">
          {t.state.status === "idle" ? "▶ スタート" : running ? "❚❚ 一時停止" : "▶ 再開"}
        </button>
        <button type="button" className="btn-secondary py-5" onClick={t.skip} disabled={v.finished || t.state.status === "idle" || t.state.segments.length < 2} aria-label="次の区間へ">
          ⏭
        </button>
        <button type="button" className="btn-secondary py-5" onClick={t.reset} aria-label="リセット" data-testid="timer-reset">
          ↺
        </button>
      </section>
      <section className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => t.adjust(30)}>
          +30秒
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => t.adjust(-30)}>
          −30秒
        </button>
        {entry && v.finished && (
          <button type="button" className="btn-primary ml-auto px-3 py-1.5" onClick={applyActual}>
            計画どおり実施 → 実績に反映
          </button>
        )}
      </section>

      {/* 設定 */}
      {machine === "interval" && (
        <section className="card space-y-3 p-3" data-testid="interval-editor">
          <div className="text-xs font-semibold text-muted">インターバルを設定（セットしてからスタート）</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="運動">
              <NumberField label="運動の秒数" unit="秒" value={intervalCfg.workSec} onChange={(n) => setIntervalCfg({ ...intervalCfg, workSec: n ?? 1 })} step={5} min={1} max={3600} decimals={0} size="sm" className="w-full" />
            </Field>
            <Field label="休憩">
              <NumberField label="休憩の秒数" unit="秒" value={intervalCfg.restSec} onChange={(n) => setIntervalCfg({ ...intervalCfg, restSec: n ?? 0 })} step={5} min={0} max={3600} decimals={0} size="sm" className="w-full" />
            </Field>
            <Field label="回数">
              <NumberField label="回数" unit="回" value={intervalCfg.rounds} onChange={(n) => setIntervalCfg({ ...intervalCfg, rounds: n ?? 1 })} step={1} min={1} max={99} decimals={0} size="sm" className="w-full" />
            </Field>
            <Field label="準備">
              <NumberField label="準備の秒数" unit="秒" value={intervalCfg.prepSec} onChange={(n) => setIntervalCfg({ ...intervalCfg, prepSec: n ?? 0 })} step={5} min={0} max={60} decimals={0} size="sm" className="w-full" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { label: "20秒/10秒×8", c: { prepSec: 5, workSec: 20, restSec: 10, rounds: 8 } },
              { label: "40秒/20秒×8", c: { prepSec: 5, workSec: 40, restSec: 20, rounds: 8 } },
              { label: "60秒/30秒×6", c: { prepSec: 5, workSec: 60, restSec: 30, rounds: 6 } },
              { label: "45秒/90秒×3", c: { prepSec: 0, workSec: 45, restSec: 90, rounds: 3 } },
            ].map((p) => (
              <button key={p.label} type="button" className="chip px-3 py-1 text-xs" onClick={() => setIntervalCfg(p.c)}>
                {p.label}
              </button>
            ))}
          </div>
          <NameAndSet
            name={name}
            setName={setName}
            summary={`合計 ${formatDuration(buildInterval(intervalCfg).reduce((a, s) => a + s.durationSec, 0))}`}
            onSet={() => {
              const segs = buildInterval(intervalCfg);
              requestLoad("interval", segs, name || autoTitle("interval", segs));
            }}
          />
        </section>
      )}

      {machine === "countdown" && (
        <section className="card space-y-3 p-3" data-testid="countdown-editor">
          <div className="text-xs font-semibold text-muted">時間を設定（セットしてからスタート）</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="分">
              <NumberField label="分" unit="分" value={countMin} onChange={setCountMin} step={1} min={0} max={180} decimals={0} size="sm" className="w-full" />
            </Field>
            <Field label="秒">
              <NumberField label="秒" unit="秒" value={countSec} onChange={setCountSec} step={5} min={0} max={59} decimals={0} size="sm" className="w-full" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1">
            {[30, 60, 90, 120, 180, 300, 600, 900].map((sec) => (
              <button
                key={sec}
                type="button"
                className="chip px-3 py-1 text-xs"
                onClick={() => {
                  setCountMin(Math.floor(sec / 60));
                  setCountSec(sec % 60);
                }}
              >
                {sec < 60 ? `${sec}秒` : sec % 60 ? `${Math.floor(sec / 60)}分${sec % 60}秒` : `${sec / 60}分`}
              </button>
            ))}
          </div>
          <NameAndSet name={name} setName={setName} summary={`合計 ${formatDuration(countTotal)}`} disabled={countTotal <= 0} onSet={() => requestLoad("countdown", buildCountdown(countTotal), name || autoTitle("countdown", buildCountdown(countTotal)))} />
        </section>
      )}

      {(machine === "bike" || machine === "treadmill") && !entry && (
        <section className="card space-y-2 p-3">
          <div className="text-xs font-semibold text-muted">プリセット（選ぶとセットされます。スタートは自分で押します）</div>
          <div className="flex flex-wrap gap-2">
            {machine === "bike"
              ? [5, 6, 7, 10].map((m) => (
                  <button key={m} type="button" className="chip" onClick={() => requestLoad("bike", toTimerSegments(bikeWarmup(m).plan), `バイク ${m}分`)}>
                    {m}分（L15→L20）
                  </button>
                ))
              : (
                  [
                    { label: "ウォーク15分", segs: () => toTimerSegments(buildTreadmillPlan("walk", 15)) },
                    { label: "ウォーク25分", segs: () => toTimerSegments(buildTreadmillPlan("walk", 25)) },
                    { label: "ラン 12km/h 2分×5", segs: () => toTimerSegments(buildTreadmillPlan("run", 25, { speedKmh: 12, totalRunMin: 10, intervalMin: 2, rationale: "" })) },
                    { label: "ラン 12km/h 3分×4", segs: () => toTimerSegments(buildTreadmillPlan("run", 25, { speedKmh: 12, totalRunMin: 12, intervalMin: 3, rationale: "" })) },
                  ] as const
                ).map((p) => (
                  <button key={p.label} type="button" className="chip" onClick={() => requestLoad("treadmill", p.segs(), autoTitle("treadmill", p.segs()))}>
                    {p.label}
                  </button>
                ))}
          </div>
        </section>
      )}

      {/* 履歴 */}
      <section className="card p-3" data-testid="timer-history">
        <div className="mb-1 text-xs font-semibold text-muted">履歴から呼び出す（タップでセット・スタートは自分で）</div>
        {history.length === 0 ? (
          <p className="text-sm text-muted">スタートしたタイマーがここに残ります。</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <HistoryRow key={h.id} h={h} onLoad={() => requestLoad(h.type, historySegments(h), h.title)} onDelete={() => deleteTimerHistory(h.id)} />
            ))}
          </ul>
        )}
      </section>

      {/* 区間一覧 */}
      {t.state.segments.length > 1 && (
        <section className="card p-3">
          <div className="mb-1 text-xs font-semibold text-muted">区間</div>
          <ul className="divide-y divide-border text-sm">
            {t.state.segments.map((s, i) => (
              <li key={s.id} className={`flex items-center justify-between py-1 ${i === v.index && !v.finished ? "font-bold" : i < v.index ? "text-muted line-through" : ""}`}>
                <span>
                  {i + 1}. {segLabel(s)}
                </span>
                <span className="tabular">
                  {s.level !== undefined ? `L${s.level}` : s.speedKmh !== undefined ? `${s.speedKmh}km/h ${s.inclinePct ?? 0}%` : ""} {s.level !== undefined || s.speedKmh !== undefined ? "・ " : ""}
                  {formatDuration(s.durationSec)}
                </span>
              </li>
            ))}
          </ul>
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
          <button
            type="button"
            className="underline"
            onClick={() => {
              unlockAudio();
              t.testBeep();
            }}
          >
            音をテスト
          </button>
        </div>
        <p>
          iPhone の Safari / ホーム画面アプリでは、画面がスリープしたりアプリが裏に回ると音や振動は鳴りません（iOS の制約）。区間の切り替えを見逃さないために「画面を消灯しない」を有効にし、画面を表示したままにしてください。スリープしても再表示時に経過時間は正しく復元されます。
        </p>
      </section>

      <ConfirmDialog
        open={!!pending}
        title="タイマーを置き換えますか？"
        message="動いている（または途中で止めた）タイマーをリセットして、新しい設定をセットします。"
        confirmLabel="置き換える"
        onConfirm={() => pending && load(pending.type, pending.segments, pending.title)}
        onClose={() => setPending(null)}
      />
    </div>
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

function NameAndSet({ name, setName, summary, onSet, disabled }: { name: string; setName: (s: string) => void; summary: string; onSet: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <input className="input text-sm" maxLength={30} placeholder="名前（任意。例：脚の日サーキット）" value={name} onChange={(e) => setName(e.target.value)} aria-label="タイマーの名前" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted tabular">{summary}</span>
        <button type="button" className="btn-primary ml-auto px-5" onClick={onSet} disabled={disabled} data-testid="timer-set">
          この設定をセット
        </button>
      </div>
    </div>
  );
}

function HistoryRow({ h, onLoad, onDelete }: { h: TimerHistoryEntry; onLoad: () => void; onDelete: () => void }) {
  const total = h.segments.reduce((a, s) => a + s.durationSec, 0);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <button type="button" className="tap flex min-w-0 flex-1 flex-col items-start text-left" onClick={onLoad} data-testid="timer-history-item">
        <span className="truncate text-sm font-medium">{h.title}</span>
        <span className="text-[11px] text-muted">
          {TIMER_TYPE_LABEL[h.type]} ・ {formatDuration(total)} ・ {h.useCount}回使用
        </span>
      </button>
      <button type="button" className="tap px-2 text-muted" onClick={onDelete} aria-label={`${h.title} を履歴から削除`}>
        ✕
      </button>
    </li>
  );
}
