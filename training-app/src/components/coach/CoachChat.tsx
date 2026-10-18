"use client";
import { useEffect, useRef, useState } from "react";
import { useCoach } from "./useCoach";
import { CoachInput } from "./CoachInput";

export function CoachChat() {
  const { messages, aiEnabled, aiModel, mode, setMode, clear, hasWorkout } = useCoach();
  const endRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <header className="flex items-center justify-between pb-2">
        <h1 className="text-2xl font-bold">AIコーチ</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${aiEnabled ? "bg-success-soft text-success" : "bg-card-2 text-muted"}`}>{aiEnabled === null ? "確認中" : aiEnabled ? `Claude (${aiModel})` : "ルールベース"}</span>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowInfo((v) => !v)}>
            ℹ︎
          </button>
        </div>
      </header>
      {showInfo && (
        <div className="mb-2 space-y-2 rounded-xl bg-card-2 p-3 text-xs text-muted">
          <p>
            <b>APIキーなしで使える機能：</b>履歴・進捗管理、タイマー、ルールベースのメニュー作成、定型の相談（「ジムに来た」「脚が疲れている」「あと20分」「このマシンがない」「重量を上げてもいい？」「ランニングをやめたい」）。
          </p>
          <p>
            <b>APIキーが必要な機能：</b>自由な自然言語での相談とメニュー再構成（Claude）。サーバーの環境変数 <code>ANTHROPIC_API_KEY</code> に設定します。キーはブラウザには送られません。
          </p>
          <p>Claude の提案は「予定」にだけ反映されます。完了済みセットや実績は AI から変更されません。</p>
          {aiEnabled && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mode === "rule"} onChange={(e) => setMode(e.target.checked ? "rule" : "auto")} />
              この会話では Claude を使わない（ルールベースのみ）
            </label>
          )}
          <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={clear}>
            会話をクリア
          </button>
        </div>
      )}
      {!hasWorkout && <p className="mb-2 rounded-xl bg-warn-soft p-2 text-xs text-warn">進行中のトレーニングがありません。メニューの変更系の相談はトレーニング開始後に有効です。</p>}
      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">「ジムに来た」と話しかけると今日のヒアリングを始めます。</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-accent text-accent-fg" : "bg-card-2"}`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.applied && m.applied.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-success">
                  {m.applied.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {m.skipped && m.skipped.length > 0 && <div className="mt-1 text-[10px] text-muted">適用できなかった操作：{m.skipped.join("、")}</div>}
              {m.role === "assistant" && <div className="mt-1 text-[10px] text-muted">{m.source === "claude" ? "Claude" : "ルールベース"}</div>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="sticky bottom-20">
        <CoachInput />
      </div>
    </div>
  );
}
