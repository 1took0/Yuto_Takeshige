"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BodyRegion } from "@/lib/types";
import { REGION_LABEL, REGION_ORDER } from "@/lib/catalog/muscles";
import { getExercise } from "@/lib/catalog/exercises";
import { useCoach } from "./useCoach";

type Step = "time" | "fatigue" | "no_machine" | "weight" | "dislike" | "comeback" | null;

/** 久しぶりの選択肢（表示名と、メモ・調整に使う文） */
const GAPS = [
  { label: "1〜2週間ぶり", text: "約10日ぶり", days: 10 },
  { label: "2〜4週間ぶり", text: "約3週間ぶり", days: 21 },
  { label: "1〜2か月ぶり", text: "約6週間ぶり", days: 42 },
  { label: "2か月以上ぶり", text: "約3か月ぶり", days: 90 },
];

const TIMES = [10, 15, 20, 30, 45];

/**
 * コーチへの相談（選択肢から選ぶ）
 * 自由入力はせず、用意した相談を選ぶと今日のメニュー・今後の希望に反映する
 */
export function CoachPresets() {
  const router = useRouter();
  const { messages, choose, busy, workout } = useCoach();
  const [step, setStep] = useState<Step>(null);
  const [regions, setRegions] = useState<BodyRegion[]>([]);
  const last = messages[messages.length - 1];

  const pending = workout ? workout.exercises.filter((e) => e.status !== "skipped" && e.sets.some((s) => !s.completed && !s.excluded)) : [];
  const weighted = pending.filter((e) => {
    const t = getExercise(e.exerciseId)?.loadType;
    return t === "weight" || t === "assist";
  });
  const running = !!workout?.cardio.some((c) => c.machine === "treadmill" && !c.completed && c.plan.some((s) => s.kind === "run"));
  const cardioLeft = !!workout?.cardio.some((c) => !c.completed && !c.skipped);

  const run = async (label: string, action: Parameters<typeof choose>[1]) => {
    setStep(null);
    setRegions([]);
    await choose(label, action);
  };

  const presets: { id: string; label: string; onClick: () => void; hidden?: boolean }[] = workout
    ? [
        { id: "time", label: "残り時間が少ない", onClick: () => setStep("time") },
        { id: "fatigue", label: "疲れている部位がある", onClick: () => setStep("fatigue") },
        { id: "no_machine", label: "マシンが使えない・空いていない", onClick: () => setStep("no_machine"), hidden: !pending.length },
        { id: "weight", label: "重量を上げてもいい？", onClick: () => setStep("weight"), hidden: !weighted.length },
        { id: "stop_running", label: "ランニングをやめてウォーキングにする", onClick: () => run("ランニングをやめてウォーキングにする", { intent: { type: "stop_running" } }), hidden: !running },
        { id: "skip_cardio", label: "今日は有酸素をやめる", onClick: () => run("今日は有酸素をやめる", { intent: { type: "skip_cardio" } }), hidden: !cardioLeft },
        { id: "comeback", label: "久しぶりのトレーニングだった", onClick: () => setStep("comeback") },
        { id: "dislike", label: "今後この種目は外したい", onClick: () => setStep("dislike"), hidden: !workout.exercises.length },
      ]
    : [
        { id: "start", label: "ジムに来た（メニューを作る）", onClick: () => router.push("/start") },
        { id: "comeback", label: "久しぶりのトレーニング", onClick: () => setStep("comeback") },
      ];

  const exerciseChoices = (list: typeof pending, onPick: (exerciseId: string, name: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {list.map((e) => (
        <button key={e.id} type="button" className="chip px-3 py-1.5 text-sm" disabled={busy} onClick={() => onPick(e.exerciseId, e.name)}>
          {e.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-2" data-testid="coach-presets">
      {last && last.role === "assistant" && (
        <div className="rounded-xl bg-card-2 p-2 text-sm" data-testid="coach-reply">
          <div className="whitespace-pre-wrap">{last.content}</div>
          {last.applied && last.applied.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-success">
              {last.applied.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === null ? (
        <div className="flex flex-wrap gap-2">
          {presets
            .filter((p) => !p.hidden)
            .map((p) => (
              <button key={p.id} type="button" className="chip px-3 py-2 text-sm" disabled={busy} onClick={p.onClick} data-testid={`coach-preset-${p.id}`}>
                {p.label}
              </button>
            ))}
          {!workout && (
            <Link href="/settings#preferences" className="chip px-3 py-2 text-sm" data-testid="coach-preset-prefs">
              今後の希望を変える
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-border p-2" data-testid="coach-step">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {step === "time" && "残りは何分ですか？"}
              {step === "fatigue" && "疲れている部位を選んでください（複数可）"}
              {step === "no_machine" && "使えない種目はどれですか？（同じ部位の種目に置き換えます）"}
              {step === "weight" && "どの種目ですか？"}
              {step === "dislike" && "今後のメニューから外す種目を選んでください"}
              {step === "comeback" && "前回からどのくらい空きましたか？"}
            </span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setStep(null)}>
              戻る
            </button>
          </div>
          {step === "time" && (
            <div className="flex flex-wrap gap-2">
              {TIMES.map((m) => (
                <button key={m} type="button" className="chip px-3 py-1.5 text-sm" disabled={busy} onClick={() => run(`残り${m}分しかない`, { intent: { type: "time_left", minutes: m } })}>
                  {m}分
                </button>
              ))}
            </div>
          )}
          {step === "fatigue" && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="疲れている部位">
                {REGION_ORDER.map((r) => (
                  <button key={r} type="button" className="chip px-3 py-1.5 text-sm" aria-pressed={regions.includes(r)} data-selected={regions.includes(r)} onClick={() => setRegions((v) => (v.includes(r) ? v.filter((x) => x !== r) : [...v, r]))}>
                    {REGION_LABEL[r]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-primary w-full"
                disabled={busy || !regions.length}
                onClick={() => run(`${regions.map((r) => REGION_LABEL[r]).join("・")}が疲れている`, { intent: { type: "fatigue", regions } })}
                data-testid="coach-fatigue-apply"
              >
                この部位の負荷を下げる
              </button>
            </>
          )}
          {step === "no_machine" && exerciseChoices(pending, (id, name) => run(`${name}のマシンが使えない`, { intent: { type: "no_machine", exerciseId: id } }))}
          {step === "weight" && exerciseChoices(weighted, (id, name) => run(`${name}の重量を上げてもいい？`, { intent: { type: "weight_question", exerciseId: id } }))}
          {step === "dislike" && exerciseChoices(workout?.exercises ?? [], (id, name) => run(`今後${name}は外したい`, { wish: [{ kind: "dislike_exercise", exerciseId: id }] }))}
          {step === "comeback" && (
            <div className="flex flex-wrap gap-2">
              {GAPS.map((g) => (
                <button key={g.label} type="button" className="chip px-3 py-1.5 text-sm" disabled={busy} onClick={() => run(`久しぶり（${g.label}）`, { intent: { type: "comeback", days: g.days, text: g.text } })}>
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
