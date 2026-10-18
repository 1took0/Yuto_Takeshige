"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Workout } from "@/lib/types";
import { getSettings, importWorkouts, updateSettings } from "@/lib/db/repo";
import { OWNER_GOALS } from "@/lib/goals";

/**
 * 作成者専用：サーバーに置いた過去の記録を復元コードで取り込む
 * ナビゲーションからはリンクしていない（URL を知っている本人だけが使う）
 */
export function RestoreForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get("code") ?? "");
  const [applyGoals, setApplyGoals] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/owner-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const j = (await res.json().catch(() => ({}))) as { workouts?: Workout[]; error?: string };
      if (!res.ok || !j.workouts) {
        setMsg({ ok: false, text: res.status === 404 ? "この機能は設定されていません" : (j.error ?? "取り込めませんでした") });
        return;
      }
      const n = await importWorkouts(j.workouts);
      const s = await getSettings();
      if (applyGoals) await updateSettings({ goals: OWNER_GOALS });
      setMsg({ ok: true, text: n ? `${n}件の記録を取り込みました` : "すでに取り込み済みです" });
      setTimeout(() => router.replace(s.onboarded ? "/history" : "/welcome"), 1200);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <h1 className="text-2xl font-bold">記録の復元</h1>
      <p className="text-sm text-muted">復元コードを入力すると、保存されている過去の記録をこの端末に取り込みます。</p>
      <input className="input" type="password" autoComplete="off" placeholder="復元コード" value={code} onChange={(e) => setCode(e.target.value)} aria-label="復元コード" data-testid="restore-code" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={applyGoals} onChange={(e) => setApplyGoals(e.target.checked)} />
        目標も記録の持ち主の設定にする
      </label>
      {msg && <p className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <button type="button" className="btn-primary w-full py-4 text-lg" disabled={busy || !code.trim()} onClick={run} data-testid="restore-submit">
        {busy ? "取り込み中…" : "取り込む"}
      </button>
    </div>
  );
}
