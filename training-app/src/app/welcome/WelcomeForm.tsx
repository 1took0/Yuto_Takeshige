"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "@/lib/db/repo";
import { createProfile, enableSharing, shareApi } from "@/lib/share/client";
import { useToast } from "@/components/ui/Toast";

/** 初回設定：名前・既存履歴の取り込み・目標・共有 */
export function WelcomeForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [share, setShare] = useState(false);
  const [shareAvailable, setShareAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      if (s.profile?.displayName) setName(s.profile.displayName);
    })();
    shareApi
      .status()
      .then((st) => setShareAvailable(st.enabled))
      .catch(() => setShareAvailable(false));
  }, []);


  const submit = async () => {
    setBusy(true);
    try {
      const s = await getSettings();
      const profile = s.profile ? { ...s.profile, displayName: name.trim() } : createProfile(name);
      await updateSettings({ profile, onboarded: true });
      if (share) {
        try {
          await enableSharing();
        } catch (e) {
          toast(`共有の開始に失敗しました：${e instanceof Error ? e.message : ""}（設定画面から再試行できます）`, "error");
        }
      }
      // 初めての人は続けてヒアリングへ（答えたことがある人はホームへ）
      router.replace(s.preferences?.answeredAt ? "/" : "/hearing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-28 pt-2">
      <header>
        <h1 className="text-2xl font-bold">はじめに</h1>
        <p className="text-sm text-muted">表示名と記録の共有だけ決めます。メニューの希望（目標・経験・時間など）は次のヒアリングで聞きます。どれもあとから設定画面で変更できます。</p>
      </header>

      <section className="card space-y-2 p-3">
        <h2 className="font-semibold">表示名</h2>
        <input className="input" placeholder="例：ゆうと" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} aria-label="表示名" data-testid="welcome-name" />
        <p className="text-[11px] text-muted">記録を共有したときに、他の利用者に表示される名前です。</p>
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
              <span className="block text-[11px] text-muted">共有されるのは表示名と、いつ・どこで・どれくらい（時間・セット数）トレーニングしたかだけです。種目・重量・回数や、体調・痛み・メモは共有されません。いつでもやめられ、やめるとサーバー上の記録は削除されます。</span>
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
