"use client";

import { useRef, useState } from "react";
import { AiCoachImport } from "./AiCoachImport";
import { getSettings, listAllWorkouts, listStoreEquipment } from "@/lib/db/repo";
import { allStoresIncludingHidden } from "@/lib/catalog/stores";
import { allExercises } from "@/lib/catalog/exercises";
import { trainingDateOf } from "@/lib/date/trainingDay";
import { buildAutomaticCoachPrompt } from "@/lib/ai-coach/automatic";

export function AiCoachExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  const output = useRef<HTMLTextAreaElement>(null);

  const copy = async () => {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setFallback("");
    const pending = (async () => {
      const settings = await getSettings();
      const [workouts, equipment] = await Promise.all([listAllWorkouts(), listStoreEquipment()]);
      return buildAutomaticCoachPrompt({ settings, workouts, equipment,
        stores: allStoresIncludingHidden(), exercises: allExercises() }, trainingDateOf()).text;
    })();
    try {
      // Safariでもクリック直後にClipboard APIを呼び、DB読み込みでユーザー操作権限を失わない。
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": pending.then((text) => new Blob([text], { type: "text/plain" })) })]);
      } else {
        const text = await pending;
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
      }
      setMessage("コピーしました。使いたいAIのチャットに貼り付け、希望を会話で伝えてください。");
    } catch {
      try {
        setFallback(await pending);
        setMessage("自動コピーできませんでした。下の相談文を長押しして選択・コピーしてください。");
      } catch (e) { setError(e instanceof Error ? e.message : "相談文を作成できませんでした。もう一度お試しください。"); }
    } finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">AIにメニューを相談</h1>
    <section className="card space-y-3 p-3" aria-label="AIへ送るプロンプト">
      <p className="text-sm">希望や重量の進め方は、コピーした相談文を使ってAIとのチャットで決めます。</p>
      <button type="button" className="btn-primary w-full" disabled={busy} onClick={copy}>{busy ? "準備中…" : "AIに送るプロンプトをコピー"}</button>
      <p className="text-xs text-muted">参考店舗と直近20回までの終了記録を自動でまとめます。利用店舗がなければ一乗寺店の仮プリセットを使います。氏名・共有情報・保存済みの健康情報・自由記述メモ・店舗の実名は含めません。種目名などは含みます。AIへの自動送信はありません。</p>
      {error && <p role="alert" className="rounded-xl bg-warn-soft p-3 text-sm">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-card-2 p-3 text-sm">{message}</p>}
      {fallback && <label className="block text-sm">手動でコピーする相談文
        <textarea ref={output} className="input mt-1 min-h-48 w-full text-sm" readOnly value={fallback} onFocus={() => output.current?.select()} />
      </label>}
    </section>
    <AiCoachImport onApplied={() => { setFallback(""); setMessage(""); }} />
  </div>;
}
