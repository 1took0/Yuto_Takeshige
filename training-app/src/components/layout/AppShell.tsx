"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ensureSeeded, getActiveWorkout, getSettings } from "@/lib/db/repo";
import { ShareSync } from "@/components/share/ShareSync";
import { useSettings } from "@/hooks/useSettings";
import { ActiveWorkoutProvider } from "@/components/workout/ActiveWorkoutProvider";
import { ToastProvider } from "@/components/ui/Toast";

const TABS = [
  { href: "/", label: "ホーム", icon: HomeIcon },
  { href: "/workout", label: "トレーニング", icon: DumbbellIcon },
  { href: "/history", label: "履歴", icon: ListIcon },
  { href: "/analytics", label: "分析", icon: ChartIcon },
  { href: "/community", label: "みんな", icon: UsersIcon },
  { href: "/settings", label: "設定", icon: GearIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useSettings();
  const active = useLiveQuery(() => getActiveWorkout(), [], undefined);

  useEffect(() => {
    let cancelled = false;
    ensureSeeded()
      .catch((e) => console.error("seed failed", e))
      .then(() => getSettings())
      .then((s) => {
        // 初回設定が済んでいなければ「はじめに」へ
        const path = window.location.pathname;
        if (!cancelled && !s.onboarded && path !== "/welcome" && path !== "/login") router.replace("/welcome");
      })
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("SW 登録失敗", e));
  }, []);

  const hideNav = pathname.startsWith("/timer/") || pathname === "/start" || pathname === "/welcome" || pathname === "/login";

  return (
    <ToastProvider>
      <ActiveWorkoutProvider>
        <ShareSync />
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
          <main className={`flex-1 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] ${hideNav ? "pb-6" : "pb-28"}`}>
            {ready ? children : <div className="py-20 text-center text-muted">読み込み中…</div>}
          </main>
          {!hideNav && (
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur safe-bottom" aria-label="メインナビゲーション">
              <ul className="mx-auto flex max-w-lg justify-around px-2 pt-1">
                {TABS.map((t) => {
                  const isActive = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
                  const Icon = t.icon;
                  const badge = t.href === "/workout" && active;
                  return (
                    <li key={t.href} className="flex-1">
                      <Link
                        href={t.href}
                        className={`tap relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium ${isActive ? "text-accent" : "text-muted"}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon />
                        {t.label}
                        {badge && <span className="absolute right-3 top-1 h-2.5 w-2.5 rounded-full bg-success" aria-label="記録中" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>
      </ActiveWorkoutProvider>
    </ToastProvider>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function DumbbellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18M7 15l4-4 4 3 5-6" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
