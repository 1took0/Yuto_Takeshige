"use client";
import { useEffect, useRef, useState } from "react";
import { useCoach } from "./useCoach";
import { CoachInput } from "./CoachInput";

export function CoachChat() {
  const { messages, clear, hasWorkout } = useCoach();
  const endRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <header className="flex items-center justify-between pb-2">
        <h1 className="text-2xl font-bold">コーチ</h1>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowInfo((v) => !v)} aria-label="使い方">
          ℹ︎
        </button>
      </header>
      {showInfo && (
        <div className="mb-2 space-y-2 rounded-xl bg-card-2 p-3 text-xs text-muted">
          <p>定型の相談に対応しています（外部サービスは使わず無料で動作します）：</p>
          <ul className="list-disc pl-4">
            <li>「ジムに来た」…ヒアリングを開始</li>
            <li>「今日は脚が疲れている」…該当部位の負荷とセット数を下げる</li>
            <li>「あと20分しかない」…残り時間に合わせて種目を絞る</li>
            <li>「レッグプレスのマシンがない」…代替種目に置き換え</li>
            <li>「チェストプレスの重量を上げてもいい？」…実績から判断</li>
            <li>「今日はランニングをやめたい」…ウォーキングに変更</li>
            <li>「ハンマーカールを追加して」「ペックフライを外して」</li>
          </ul>
          <p>提案は「予定」にだけ反映されます。完了済みセットや実績は変更されません。</p>
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
