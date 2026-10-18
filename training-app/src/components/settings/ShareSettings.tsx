"use client";
import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { createProfile, disableSharing, enableSharing, fullSync, shareApi } from "@/lib/share/client";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { formatTimeHM, formatJaDate, trainingDateOf } from "@/lib/date/trainingDay";

/** プロフィール（表示名）と記録共有のオン・オフ */
export function ShareSettings() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<{ enabled: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    shareApi
      .status()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, reason: "共有サーバーに接続できません" }));
  }, []);

  const displayName = name ?? settings.profile?.displayName ?? "";

  const saveName = async () => {
    const n = displayName.trim();
    if (!n) return;
    const profile = settings.profile ? { ...settings.profile, displayName: n } : createProfile(n);
    await update({ profile });
    if (settings.sharing) await shareApi.register(profile).catch(() => update({ shareDirty: true }));
    setName(null);
    toast("表示名を保存しました", "success");
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      if (!settings.profile) await update({ profile: createProfile(displayName || "名無し") });
      const r = await enableSharing();
      toast(`共有を開始しました（${r.count}件）`, "success");
    } catch (e) {
      toast(`共有できませんでした：${e instanceof Error ? e.message : ""}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disableSharing();
      toast("共有をやめました。サーバー上の記録は削除されました");
    } catch (e) {
      toast(`共有の停止に失敗しました：${e instanceof Error ? e.message : ""}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const last = settings.lastSharedAt;
  return (
    <section id="share" className="card space-y-3 p-3">
      <h2 className="font-semibold">プロフィールと記録の共有</h2>
      <div className="flex gap-2">
        <input className="input" maxLength={20} placeholder="表示名" value={displayName} onChange={(e) => setName(e.target.value)} aria-label="表示名" />
        <button type="button" className="btn-secondary shrink-0" onClick={saveName} disabled={name === null || !displayName.trim()}>
          保存
        </button>
      </div>
      {status && !status.enabled ? (
        <p className="text-sm text-muted">{status.reason}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">記録をアプリ利用者全員に共有する</div>
              <div className="text-[11px] text-muted">種目・重量・回数・有酸素の記録と表示名が共有されます。体調・痛み・ヒアリングのメモは共有されません。</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!settings.sharing}
              aria-label="記録を共有する"
              disabled={busy || status === null}
              onClick={() => (settings.sharing ? setConfirmOff(true) : turnOn())}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${settings.sharing ? "bg-success" : "bg-border"}`}
              data-testid="share-toggle"
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${settings.sharing ? "left-7" : "left-1"}`} />
            </button>
          </div>
          {settings.sharing && (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {settings.shareDirty ? "未送信の変更があります（通信が戻ると自動で送信）" : last ? `最終同期 ${last.slice(0, 10) === new Date().toISOString().slice(0, 10) ? formatTimeHM(last) : formatJaDate(trainingDateOf(new Date(last)))}` : ""}
              </span>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs text-accent"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fullSync();
                    toast(`同期しました（${r.count}件）`, "success");
                  } catch (e) {
                    toast(`同期に失敗しました：${e instanceof Error ? e.message : ""}`, "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                今すぐ同期
              </button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={confirmOff} title="共有をやめますか？" message="サーバー上のあなたの記録は削除され、他の利用者からは見えなくなります。この端末の記録はそのまま残ります。" confirmLabel="共有をやめる" danger onConfirm={turnOff} onClose={() => setConfirmOff(false)} />
    </section>
  );
}
