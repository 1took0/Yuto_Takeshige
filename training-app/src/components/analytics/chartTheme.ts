import type { StoreId } from "@/lib/types";

/**
 * グラフの配色（dataviz 参照パレット、検証済み）
 * 店舗ごとに固定の色を割り当て、並び順やフィルタで色が変わらないようにする
 */
export const STORE_SERIES_LIGHT: Record<StoreId, string> = { ichijoji: "#2a78d6", "higashiyama-nijo": "#eb6834", "sanjo-ohashi": "#1baf7a" };
export const STORE_SERIES_DARK: Record<StoreId, string> = { ichijoji: "#3987e5", "higashiyama-nijo": "#d95926", "sanjo-ohashi": "#199e70" };

export function storeColor(storeId: StoreId, dark: boolean): string {
  return (dark ? STORE_SERIES_DARK : STORE_SERIES_LIGHT)[storeId];
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
