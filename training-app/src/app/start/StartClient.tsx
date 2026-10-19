"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IntakeForm } from "@/components/workout/IntakeForm";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";
import { ManualStartForm } from "@/components/workout/ManualStartForm";
import { getSettings, listCompletedWorkouts } from "@/lib/db/repo";
import { needsFirstHearing } from "@/lib/preferences";

/** はじめてのトレーニングでは、先にメニューの希望を質問してから今日のコンディションへ */
export function StartClient() {
  const sp = useSearchParams();
  const manual = sp.get("manual") === "1";
  const [step, setStep] = useState<"loading" | "hearing" | "intake">("loading");

  useEffect(() => {
    if (manual) return;
    let cancelled = false;
    void Promise.all([getSettings(), listCompletedWorkouts()]).then(([s, done]) => {
      if (!cancelled) setStep(needsFirstHearing(s.preferences, done.length) ? "hearing" : "intake");
    });
    return () => {
      cancelled = true;
    };
  }, [manual]);

  // メニューを作らず自分で入力する場合はヒアリングなし
  if (manual) return <ManualStartForm />;
  if (step === "loading") return <p className="py-10 text-center text-muted">読み込み中…</p>;
  if (step === "hearing") return <PreferencesForm mode="first" onDone={() => setStep("intake")} />;
  return <IntakeForm presetMemo={sp.get("memo") ?? undefined} />;
}
