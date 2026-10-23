"use client";
import { useEffect, useState } from "react";

/** Android の Chrome などが出す「インストール」の合図（型は標準に無いので最小限だけ定義） */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Env = "standalone" | "ios" | "android" | "other";

function detectEnv(): Env {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone) return "standalone";
  const ua = navigator.userAgent;
  // iPadOS の Safari は Mac として名乗るので、タッチの有無でも判定する
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/**
 * ホーム画面に追加してアプリとして使うよう案内する（「はじめに」で表示）
 * - iPhone の Safari とホーム画面のアプリは保存場所が別なので、先に追加してアプリから始めてもらう
 * - すでにホーム画面のアプリで開いていれば何も出さない
 */
export function InstallGuide() {
  const [env, setEnv] = useState<Env | null>(null);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    // 画面の表示後に一度だけ判定する（サーバーで描くときは端末が分からないため）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv(detectEnv());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!env || env === "standalone") return null;

  return (
    <section className="card space-y-2 border-accent p-3" data-testid="install-guide">
      <h2 className="font-semibold">ホーム画面に追加して使ってください</h2>
      <p className="text-sm">アプリのように全画面で開け、トレーニング中もすぐ戻れます。</p>
      {env === "ios" && (
        <>
          <ol className="ml-5 list-decimal space-y-1 text-sm">
            <li>
              Safari の下（または上）にある共有ボタン <ShareIcon /> を押す
            </li>
            <li>「ホーム画面に追加」を選び、右上の「追加」を押す</li>
            <li>ホーム画面にできた「トレーニングコーチ」のアイコンから開き直す</li>
          </ol>
          <p className="rounded-lg bg-warn-soft px-2 py-1.5 text-xs text-warn">
            iPhone では、Safari とホーム画面のアプリで記録の保存場所が別になります。先にホーム画面に追加し、アプリのほうで「はじめに」から始めてください（アプリでは、もう一度パスワードを入力します）。
          </p>
        </>
      )}
      {env === "android" &&
        (promptEvent ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={async () => {
              await promptEvent.prompt();
              await promptEvent.userChoice;
              setPromptEvent(null);
            }}
            data-testid="install-button"
          >
            ホーム画面に追加する
          </button>
        ) : (
          <ol className="ml-5 list-decimal space-y-1 text-sm">
            <li>Chrome の右上のメニュー（︙）を押す</li>
            <li>「ホーム画面に追加」または「アプリをインストール」を選ぶ</li>
            <li>ホーム画面にできたアイコンから開き直す</li>
          </ol>
        ))}
      {env === "other" && <p className="text-xs text-muted">スマホ（iPhone の Safari、Android の Chrome）で開くと、ホーム画面に追加できます。</p>}
    </section>
  );
}

/** iPhone の共有ボタン（四角から上向きの矢印） */
function ShareIcon() {
  return (
    <svg className="inline h-4 w-4 align-[-2px] text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="共有">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
