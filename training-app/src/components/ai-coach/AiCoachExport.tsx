"use client";

import Link from "next/link";
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
  const [hasActive, setHasActive] = useState(false);
  const [preview, setPreview] = useState<{ text: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const output = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getSettings().then(async (settings) => {
      const workouts = await listAllWorkouts();
      if (cancelled) return;
      const active = workouts.some((w) => w.status === "active");
      setStores(allStores());
      setHasActive(active);
      setForm({
        storeId: defaultStoreId(settings.lastStoreId), historyCount: 8,
        request: settings.aiCoachRequest ?? "", todayNotes: "",
        includeHealth: false, includeNotes: false, includeStoreNames: false, includeActivePlan: active,
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
      const active = workouts.find((w) => w.status === "active");
      setHasActive(!!active);
      const currentStores = allStores();
      setStores(currentStores);
      if (!currentStores.some((s) => s.id === form.storeId)) throw new Error("店舗が変更されています。店舗を選び直してください。");
      setPreview(buildAiCoachPrompt({
        settings, workouts, equipment, stores: allStoresIncludingHidden(), exercises: allExercises(), activeWorkout: active,
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
        <p className="text-sm text-muted">希望・記録・店舗の器具をひとつの相談文にまとめます。ChatGPT・Claude・Gemini・Grokなど、使いたいAIへそのまま貼り付けられます。AIへの自動送信はありません。</p>
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
            <p className="text-xs text-muted">ここに保存した文章はAIへの相談に使います。アプリ内の自動メニューには自動反映されません。</p>
          </section>

          <section className="card space-y-3 p-3">
            <h2 className="font-semibold">2. 今日の条件</h2>
            <label className="block text-sm">使う店舗
              <select className="input mt-1 w-full" value={form.storeId} onChange={(e) => change("storeId", e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">使える時間
                <select className="input mt-1 w-full" value={form.timeLimitMin === undefined ? "unknown" : form.timeLimitMin === null ? "unlimited" : form.timeLimitMin} onChange={(e) => change("timeLimitMin", e.target.value === "unknown" ? undefined : e.target.value === "unlimited" ? null : Number(e.target.value))}>
                  <option value="unknown">未指定</option>
                  {[30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n}分</option>)}
                  <option value="unlimited">制限なし</option>
                </select>
              </label>
              <label className="block text-sm">有酸素の希望
                <select className="input mt-1 w-full" value={form.cardio ?? "unknown"} onChange={(e) => change("cardio", e.target.value === "unknown" ? undefined : e.target.value as Form["cardio"])}>
                  <option value="unknown">未指定</option><option value="none">なし</option><option value="walk">ウォーキング</option><option value="run">ランニング</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">今日の体調
              <select className="input mt-1 w-full" value={form.condition ?? "unknown"} onChange={(e) => change("condition", e.target.value === "unknown" ? undefined : Number(e.target.value))}>
                <option value="unknown">未指定</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5{n === 1 ? "（悪い）" : n === 5 ? "（とても良い）" : ""}</option>)}
              </select>
            </label>
            <label className="block text-sm">今日の疲労・痛み・重点部位など（任意）
              <textarea className="input mt-1 min-h-24 w-full" maxLength={2000} value={form.todayNotes} onChange={(e) => change("todayNotes", e.target.value)} placeholder="今日だけ伝えたい条件を入力" />
            </label>
            <p className="text-xs text-muted">この画面で入力した希望と今日の条件は相談文に含まれます。空欄は「未指定」として扱います。</p>
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
            {hasActive && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.includeActivePlan} onChange={(e) => change("includeActivePlan", e.target.checked)} />進行中のメニューを含め、残りの内容を相談する</label>}
            <p className="text-xs text-muted">入力した文章や種目名・メモに個人情報が含まれる場合があります。コピー前に相談文を確認してください。</p>
          </section>
          <button type="button" className="btn-primary w-full" onClick={generate}>{busy ? "準備中…" : "相談文を作成"}</button>
        </fieldset>

        {preview && <section className="card space-y-3 p-3" aria-label="AIへの相談文">
          <h2 className="font-semibold">4. 確認してAIへ貼り付ける</h2>
          <p className="text-xs text-muted">終了済み記録 {preview.count}回・{preview.text.length.toLocaleString()}文字。長い場合は記録の件数を減らせます。</p>
          <textarea ref={output} className="input min-h-72 w-full text-xs" readOnly value={preview.text} aria-label="コピーする相談文" />
          <button type="button" className="btn-primary w-full" onClick={copy}>相談文をコピー</button>
          <button type="button" className="btn-secondary w-full" onClick={() => downloadText(`training-ai-${trainingDateOf()}.txt`, preview.text)}>テキストを保存</button>
          <p className="text-sm">AIの回答を確認し、{hasActive ? "進行中のトレーニングを編集するか、終了後に手入力で次のメニューを作れます。" : "「メニューを自分で入力して記録」から提案を入力してください。"}回答を貼り付けて自動取り込みする機能はありません。</p>
          <Link className="btn-secondary w-full" href={hasActive ? "/workout" : "/start?manual=1"}>{hasActive ? "進行中のトレーニングへ" : "メニューを自分で入力して記録"}</Link>
        </section>}
      </>}
    </div>
  );
}
