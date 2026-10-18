"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect } from "react";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "@/lib/db/repo";
import { allStores, setCustomStores } from "@/lib/catalog/stores";
import { allExercises, setCustomExercises } from "@/lib/catalog/exercises";
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
  // 店舗名・種目をどこからでも同期的に引けるよう、追加分をレジストリに反映
  setCustomStores(settings.customStores);
  setCustomExercises(settings.customExercises);
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

/** 登録済みの全店舗（最初からある店舗＋追加した店舗） */
export function useStores() {
  const { settings } = useSettings();
  setCustomStores(settings.customStores);
  return allStores();
}

/** 全種目（標準＋自作） */
export function useExercises() {
  const { settings } = useSettings();
  setCustomExercises(settings.customExercises);
  return allExercises();
}
