"use client";
import { useState } from "react";
import { useCoach } from "./useCoach";

const SUGGESTIONS = ["ジムに来た", "今日は脚が疲れている", "あと20分しかない", "今日はランニングをやめたい", "重量を上げてもいい？"];

/** チャット入力（ホーム・ワークアウト画面に埋め込む簡易版） */
export function CoachInput({ compact }: { compact?: boolean }) {
  const { messages, send, busy, aiEnabled } = useCoach();
  const [text, setText] = useState("");
  const last = messages[messages.length - 1];
  const submit = () => {
    const t = text;
    setText("");
    send(t);
  };
  return (
    <div className="space-y-2">
      {last && last.role === "assistant" && (
        <div className="rounded-xl bg-card-2 p-2 text-sm" data-testid="coach-reply">
          <div className="whitespace-pre-wrap">{last.content}</div>
          {last.applied && last.applied.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-success">{last.applied.map((a) => <li key={a}>{a}</li>)}</ul>}
          <div className="mt-1 text-[10px] text-muted">{last.source === "claude" ? "Claude" : "ルールベース"}</div>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input className="input" placeholder={compact ? "例：ジムに来た / あと20分しかない" : "メッセージを入力"} value={text} onChange={(e) => setText(e.target.value)} aria-label="コーチへのメッセージ" enterKeyHint="send" data-testid="coach-input" />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !text.trim()} data-testid="coach-send">
          {busy ? "…" : "送信"}
        </button>
      </form>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip shrink-0 px-3 py-1 text-xs" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      {aiEnabled === false && !compact && <p className="text-[11px] text-muted">Claude API は未設定のため、ルールベースで応答しています（履歴・進捗・タイマー・メニュー作成はすべて利用できます）。</p>}
    </div>
  );
}
