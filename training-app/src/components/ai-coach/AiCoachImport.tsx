"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getSettings } from "@/lib/db/repo";
import { allExercises } from "@/lib/catalog/exercises";
import { describeAdjustment, parseAiAdjustment, type AiAdjustment } from "@/lib/ai-coach/import";
import { applyAiPolicy, reviewKey, undoAiPolicy } from "@/lib/ai-coach/storage";

export function AiCoachImport({ onApplied }: { onApplied: () => void }) {
  const settings = useLiveQuery(() => getSettings(), []);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ adjustment: AiAdjustment; lines: string[]; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const check = async () => {
    setBusy(true); setPreview(null); setError(""); setMessage("");
    try {
      const s = await getSettings();
      const adjustment = parseAiAdjustment(text, allExercises());
      setPreview({ adjustment, lines: describeAdjustment(s, adjustment, allExercises()), key: reviewKey(s) });
    } catch (e) { setError(e instanceof Error ? e.message : "返却文を確認できませんでした。"); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await applyAiPolicy(text, preview.key);
      setPreview(null); setText(""); onApplied();
      setMessage("方針を保存しました。次回以降の自動メニューに反映します。");
    } catch (e) { setPreview(null); setError(e instanceof Error ? e.message : "保存できませんでした。もう一度お試しください。"); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    if (!settings?.aiCoachImport || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await undoAiPolicy(settings.aiCoachImport.appliedAt);
      setPreview(null); onApplied(); setMessage("直前の取り込み前の方針に戻しました。");
    } catch (e) { setError(e instanceof Error ? e.message : "元に戻せませんでした。"); }
    finally { setBusy(false); }
  };
  return <section className="card space-y-3 p-3" aria-label="AIで決めた方針を取り込む">
    <h2 className="font-semibold">相談後の結果を反映する</h2>
    <p className="text-sm">AIとの会話で納得できたら「アプリに反映する方針を出して」と伝え、返されたJSONのコードブロックを貼り付けてください。</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">AIからの方針の返却文
        <textarea className="input mt-1 min-h-40 w-full text-sm" maxLength={40000} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setError(""); setMessage(""); }} placeholder="AIが返した方針をここに貼り付け" />
      </label>
      <button type="button" className="btn-secondary w-full" disabled={!text.trim()} onClick={check}>変更内容を確認</button>
      {preview && <div className="space-y-3 rounded-xl bg-card-2 p-3" data-testid="ai-policy-preview">
        <h3 className="font-semibold">保存する変更</h3>
        <p className="whitespace-pre-wrap text-sm">{preview.adjustment.summary}</p>
        <ul className="ml-4 list-disc space-y-2 text-sm">{preview.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
        <p className="text-xs text-muted">指定された配列は一覧ごと置き換えます。指定のない設定は保持します。以下の保存を押すまでは変更しません。</p>
        {settings?.restTimerSec != null && <p className="text-xs text-muted">休憩タイマーは設定画面の共通時間（{settings.restTimerSec}秒）が優先されます。種目別の休憩に合わせる場合は設定画面で共通時間を解除してください。</p>}
        <button type="button" className="btn-primary w-full" onClick={apply}>この方針を次回以降に反映</button>
      </div>}
      {settings?.aiCoachImport && <div className="space-y-2 border-t border-border pt-3">
        <h3 className="font-semibold">最後に取り込んだ方針</h3>
        <p className="whitespace-pre-wrap text-sm">{settings.aiCoachImport.summary}</p>
        <p className="text-xs text-muted">保存日時：{new Date(settings.aiCoachImport.appliedAt).toLocaleString("ja-JP")}</p>
        <button type="button" className="btn-secondary w-full" onClick={undo}>直前の取り込みを元に戻す</button>
        <p className="text-xs text-muted">その後に方針や条件を編集した場合は、上書きを防ぐため自動では戻しません。設定・種目別の希望はこの端末に保存され、記録用JSONバックアップには含まれません。</p>
      </div>}
    </fieldset>
    {error && <p role="alert" className="rounded-xl bg-warn-soft p-3 text-sm">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-card-2 p-3 text-sm">{message}</p>}
    <p className="text-xs text-muted">当日の痛み・疲労・器具・時間に応じた調整を優先します。過去の実績や進行中のメニューは書き換えません。固定重量や曜日別の分割、バイクの主運動化など、返却形式にない指定は取り込めません。</p>
  </section>;
}
