"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect } from "react";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "@/lib/db/repo";
import type { Settings } from "@/lib/types";

export function applyTheme(theme: Settings["theme"]) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  try {
    if (theme === "system") localStorage.removeItem("tc.theme");
    else localStorage.setItem("tc.theme", theme);
  } catch {
    /* ignore */
  }
}

export function useSettings() {
  const settings = useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [settings.theme]);
  const update = useCallback((patch: Partial<Settings>) => updateSettings(patch), []);
  return { settings, update };
}
