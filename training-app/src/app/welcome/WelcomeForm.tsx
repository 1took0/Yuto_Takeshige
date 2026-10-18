"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Goals } from "@/lib/types";
import { DEFAULT_GOALS, OWNER_GOALS } from "@/lib/goals";
import { countImportedSeed, getSettings, importSeedHistory, updateSettings } from "@/lib/db/repo";
import { createProfile, enableSharing, shareApi } from "@/lib/share/client";
import { GoalsEditor } from "@/components/settings/GoalsEditor";
import { useToast } from "@/components/ui/Toast";

/** 初回設定：名前・既存履歴の取り込み・目標・共有 */
export function WelcomeForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [importSeed, setImportSeed] = useState(false);
  const [alreadyImported, setAlreadyImported] = useState(0);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [goalsTouched, setGoalsTouched] = useState(false);
  const [share, setShare] = useState(false);
  const [shareAvailable, setShareAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, n] = await Promise.all([getSettings(), countImportedSeed()]);
      setAlreadyImported(n);
      if (s.profile?.displayName) setName(s.profile.displayName);
      // 以前のバージョンで履歴を取り込み済みの利用者は、作成者の目標を初期値に
      if (n > 0 && !s.goals) setGoals(OWNER_GOALS);
      else if (s.goals) setGoals(s.goals);
    })();
    shareApi
      .status()
      .then((st) => setShareAvailable(st.enabled))
      .catch(() => setShareAvailable(false));
  }, []);

  const toggleImport = (v: boolean) => {
    setImportSeed(v);
    if (!goalsTouched) setGoals(v ? OWNER_GOALS : DEFAULT_GOALS);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const s = await getSettings();
      const profile = s.profile ? { ...s.profile, displayName: name.trim() } : createProfile(name);
      await updateSettings({ profile, goals, onboarded: true });
      if (importSeed && !alreadyImported) await importSeedHistory();
      if (share) {
        try {
          await enableSharing();
        } catch (e) {
          toast(`共有の開始に失敗しました：${e instanceof Error ? e.message : ""}（設定画面から再試行できます）`, "error");
        }
      }
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-28 pt-2">
      <header>
        <h1 className="text-2xl font-bold">はじめに</h1>
        <p className="text-sm text-muted">あなたに合わせたメニューを作るための設定です。あとから設定画面で変更できます。</p>
      </header>

      <section className="card space-y-2 p-3">
        <h2 className="font-semibold">表示名</h2>
        <input className="input" placeholder="例：ゆうと" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} aria-label="表示名" data-testid="welcome-name" />
        <p className="text-[11px] text-muted">記録を共有したときに、他の利用者に表示される名前です。</p>
      </section>

      <section className="card space-y-2 p-3">
        <h2 className="font-semibold">既存の履歴</h2>
        {alreadyImported > 0 ? (
          <p className="text-sm text-muted">取り込み済みです（{alreadyImported}件）。</p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={importSeed} onChange={(e) => toggleImport(e.target.checked)} data-testid="welcome-import" />
            <span>
              アプリ作成者の過去の記録（2026/9/20〜10/16、12回分）を取り込む
              <span className="block text-[11px] text-muted">作成者本人以外はチェックしないでください。空の状態から始まり、最初のトレーニングから記録が蓄積されます。</span>
            </span>
          </label>
        )}
      </section>

      <section className="card p-3">
        <h2 className="mb-2 font-semibold">目標</h2>
        <GoalsEditor
          value={goals}
          onChange={(g) => {
            setGoals(g);
            setGoalsTouched(true);
          }}
        />
      </section>

      <section className="card space-y-2 p-3">
        <h2 className="font-semibold">記録の共有</h2>
        {shareAvailable === false ? (
          <p className="text-sm text-muted">このアプリでは共有機能が設定されていません。記録はこの端末にだけ保存されます。</p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={share} onChange={(e) => setShare(e.target.checked)} disabled={shareAvailable === null} data-testid="welcome-share" />
            <span>
              自分のトレーニング記録をアプリ利用者全員に共有する
              <span className="block text-[11px] text-muted">共有されるのは種目・重量・回数・有酸素の記録と表示名です。体調・痛み・ヒアリングのメモは共有されません。いつでもやめられ、やめるとサーバー上の記録は削除されます。</span>
            </span>
          </label>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg bg-bg/95 px-4 pt-2 safe-bottom backdrop-blur">
        <button type="button" className="btn-primary w-full py-4 text-lg" disabled={busy || !name.trim()} onClick={submit} data-testid="welcome-submit">
          {busy ? "設定中…" : "はじめる"}
        </button>
      </div>
    </div>
  );
}
