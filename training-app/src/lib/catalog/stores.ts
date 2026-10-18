import type { StoreDef, StoreId } from "@/lib/types";

export const STORES: StoreDef[] = [
  { id: "ichijoji", name: "LifeFit一乗寺店", shortName: "一乗寺" },
  { id: "higashiyama-nijo", name: "LifeFit東山二条店", shortName: "東山二条" },
  { id: "sanjo-ohashi", name: "LifeFit三条大橋店", shortName: "三条大橋" },
];

export const STORE_IDS = STORES.map((s) => s.id) as StoreId[];

export function storeName(id: StoreId, short = false): string {
  const s = STORES.find((x) => x.id === id);
  return s ? (short ? s.shortName : s.name) : id;
}
