"use client";
import { useEffect } from "react";
import { setWorkoutChangeListener, getSettings } from "@/lib/db/repo";
import { fullSync, queueChange } from "@/lib/share/client";

/** 記録の変更を監視し、共有が有効なら共有サーバーへ反映する */
export function ShareSync() {
  useEffect(() => {
    setWorkoutChangeListener(queueChange);
    const retry = () => {
      void getSettings().then((s) => {
        if (s.sharing && s.shareDirty && navigator.onLine) fullSync().catch(() => {});
      });
    };
    retry();
    window.addEventListener("online", retry);
    const onVis = () => document.visibilityState === "visible" && retry();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      setWorkoutChangeListener(null);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
