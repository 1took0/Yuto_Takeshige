import type { BuiltinStoreId, StoreId } from "@/lib/types";
import { isBuiltinStore } from "@/lib/catalog/stores";

/**
 * グラフの配色（dataviz 参照パレット、検証済み）
 * 店舗ごとに固定の色を割り当て、並び順やフィルタで色が変わらないようにする
 */
export const STORE_SERIES_LIGHT: Record<BuiltinStoreId, string> = { ichijoji: "#2a78d6", "higashiyama-nijo": "#eb6834", "sanjo-ohashi": "#1baf7a" };
export const STORE_SERIES_DARK: Record<BuiltinStoreId, string> = { ichijoji: "#3987e5", "higashiyama-nijo": "#d95926", "sanjo-ohashi": "#199e70" };
/** 追加した店舗用（参照パレットの4〜8番目を追加順に割り当て。それ以降はグレー） */
const CUSTOM_LIGHT = ["#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const CUSTOM_DARK = ["#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const OTHER = { light: "#8a8f99", dark: "#6b7280" };

export function storeColor(storeId: StoreId, dark: boolean): string {
  if (isBuiltinStore(storeId)) return (dark ? STORE_SERIES_DARK : STORE_SERIES_LIGHT)[storeId];
  // 追加した店舗は id から色を決める（店舗を削除しても他の店舗の色が変わらず、他の人の端末でも同じ色になる）
  const pal = dark ? CUSTOM_DARK : CUSTOM_LIGHT;
  let h = 0;
  for (const ch of storeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return storeId ? pal[h % pal.length] : dark ? OTHER.dark : OTHER.light;
}

export const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};

export function useIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.theme === "dark";
}

export const AXIS = { fontSize: 11, fill: "var(--muted)" } as const;
export const GRID = { stroke: "var(--border)", strokeDasharray: "2 4" } as const;
export const TOOLTIP_STYLE = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", fontSize: 12 } as const;
