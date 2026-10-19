"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IntakeForm } from "@/components/workout/IntakeForm";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";
import { getSettings, listCompletedWorkouts } from "@/lib/db/repo";
import { needsFirstHearing } from "@/lib/preferences";

/** はじめてのトレーニングでは、先にメニューの希望を質問してから今日のコンディションへ */
export function StartClient() {
  const sp = useSearchParams();
  const [step, setStep] = useState<"loading" | "hearing" | "intake">("loading");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getSettings(), listCompletedWorkouts()]).then(([s, done]) => {
      if (!cancelled) setStep(needsFirstHearing(s.preferences, done.length) ? "hearing" : "intake");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (step === "loading") return <p className="py-10 text-center text-muted">読み込み中…</p>;
  if (step === "hearing") return <PreferencesForm mode="first" onDone={() => setStep("intake")} />;
  return <IntakeForm presetMemo={sp.get("memo") ?? undefined} />;
}
