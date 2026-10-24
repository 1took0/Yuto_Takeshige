"use client";

import { AiCoachImport } from "./AiCoachImport";
import { useEffect, useRef, useState } from "react";
import type { StoreDef } from "@/lib/types";
import { getSettings, listAllWorkouts, listStoreEquipment, updateSettings } from "@/lib/db/repo";
import { allStores, allStoresIncludingHidden, defaultStoreId } from "@/lib/catalog/stores";
import { allExercises } from "@/lib/catalog/exercises";
import { trainingDateOf } from "@/lib/date/trainingDay";
import { downloadText } from "@/lib/export";
import { buildAiCoachPrompt, type AiCoachOptions } from "@/lib/ai-coach/export";

type Form = Omit<AiCoachOptions, "trainingDate">;

export function AiCoachExport() {
  const [stores, setStores] = useState<StoreDef[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [preview, setPreview] = useState<{ text: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const output = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getSettings().then(async (settings) => {
      if (cancelled) return;
      setStores(allStores());
      setForm({
        storeId: defaultStoreId(settings.lastStoreId), historyCount: 8,
        request: settings.aiCoachRequest ?? "",
        includeHealth: false, includeNotes: false, includeStoreNames: false,
      });
    }).catch(() => !cancelled && setError("設定を読み込めませんでした。ページを開き直してください。"));
    return () => { cancelled = true; };
  }, []);

  const change = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    // Never leave a previously consented payload copyable after an option changes.
    setPreview(null);
    setMessage("");
    setError("");
  };

  const generate = async () => {
    if (!form || busy) return;
    setBusy(true);
    setPreview(null);
    setMessage("");
    setError("");
    try {
      const settings = await getSettings();
      const [workouts, equipment] = await Promise.all([listAllWorkouts(), listStoreEquipment()]);
      const currentStores = allStores();
      setStores(currentStores);
      if (!currentStores.some((s) => s.id === form.storeId)) throw new Error("店舗が変更されています。店舗を選び直してください。");
      setPreview(buildAiCoachPrompt({
        settings, workouts, equipment, stores: allStoresIncludingHidden(), exercises: allExercises(),
        options: { ...form, trainingDate: trainingDateOf() },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "相談文を作成できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const saveRequest = async () => {
    if (!form || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await updateSettings({ aiCoachRequest: form.request.trim() });
      setMessage("希望をこの端末に保存しました。次回のAI相談にも使えます。");
    } catch {
      setError("希望を保存できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!preview) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(preview.text);
      setMessage("コピーしました。使いたいAIのチャットに貼り付けてください。");
    } catch {
      output.current?.focus();
      output.current?.select();
      setMessage("自動コピーできませんでした。下の文章を選択してコピーするか、テキストを保存してください。");
    }
  };

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">AIにメニューを相談</h1>
        <p className="text-sm text-muted">過去の記録をもとに、今後継続するメニューの作成方針をAIとの会話で決めます。ChatGPT・Claude・Gemini・Grokなど、使いたいAIへそのまま貼り付けられます。AIへの自動送信はありません。</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-warn-soft p-3 text-sm">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-card-2 p-3 text-sm">{message}</p>}
      {!form ? <p>読み込み中…</p> : <>
        <fieldset disabled={busy} className="space-y-4">
          <section className="card space-y-3 p-3">
            <h2 className="font-semibold">1. あなたの希望</h2>
            <label className="block text-sm">
              相談したいこと・理想のメニュー
              <textarea className="input mt-1 min-h-32 w-full" maxLength={4000} value={form.request} onChange={(e) => change("request", e.target.value)} placeholder="いまのメニューで合わない点、好きな種目や順番、以前AIが作った理想のメニューなど" />
            </label>
            <button type="button" className="btn-secondary w-full" onClick={saveRequest}>希望をこの端末に保存</button>
            <p className="text-xs text-muted">ここは相談したい希望のメモです。会話で決めた方針を下の取り込み欄で確認・保存すると、次回以降の自動メニューに反映します。</p>
          </section>

          <section className="card space-y-3 p-3">
            <h2 className="font-semibold">2. 主に参考にする店舗</h2>
            <label className="block text-sm">参考店舗
              <select className="input mt-1 w-full" value={form.storeId} onChange={(e) => change("storeId", e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">この店舗の器具と、選択範囲内の全店舗の記録を参考にします。方針は今後の自動作成全体に適用し、重量は各店舗の実績から決めます。当日の体調や時間はメニューを作る際に指定します。</p>
          </section>

          <section className="card space-y-3 p-3">
            <h2 className="font-semibold">3. 渡す記録を選ぶ</h2>
            <label className="block text-sm">最近の記録
              <select className="input mt-1 w-full" value={form.historyCount} onChange={(e) => change("historyCount", Number(e.target.value) as Form["historyCount"])}>
                {[4, 8, 20].map((n) => <option key={n} value={n}>直近{n}回まで（全店舗）</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">種目・重量・回数・日付・目標や好みを含みます。氏名・利用者ID・共有トークンは含めません。店舗は通常「店舗1」などの仮名になります。</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.includeHealth} onChange={(e) => change("includeHealth", e.target.checked)} />保存済みの体格・痛み・過去の体調を含める</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.includeNotes} onChange={(e) => change("includeNotes", e.target.checked)} />保存済みの自由記述メモ・希望の履歴を含める</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.includeStoreNames} onChange={(e) => change("includeStoreNames", e.target.checked)} />店舗の実名を含める</label>
            <p className="text-xs text-muted">入力した文章や種目名・メモに個人情報が含まれる場合があります。コピー前に相談文を確認してください。</p>
          </section>
          <button type="button" className="btn-primary w-full" onClick={generate}>{busy ? "準備中…" : "相談文を作成"}</button>
        </fieldset>

        {preview && <section className="card space-y-3 p-3" aria-label="AIへの相談文">
          <h2 className="font-semibold">相談文を確認してAIへ貼り付ける</h2>
          <p className="text-xs text-muted">終了済み記録 {preview.count}回・{preview.text.length.toLocaleString()}文字。長い場合は記録の件数を減らせます。</p>
          <textarea ref={output} className="input min-h-72 w-full text-xs" readOnly value={preview.text} aria-label="コピーする相談文" />
          <button type="button" className="btn-primary w-full" onClick={copy}>相談文をコピー</button>
          <button type="button" className="btn-secondary w-full" onClick={() => downloadText(`training-ai-${trainingDateOf()}.txt`, preview.text)}>テキストを保存</button>
          <p className="text-sm">AIのチャットで希望をすり合わせ、最後に返された方針を下の欄に貼り付けてください。初回ヒアリングは引き続きアプリ内で利用できます。</p>
        </section>}
        <AiCoachImport onApplied={() => { setPreview(null); setMessage(""); }} />
      </>}
    </div>
  );
}
