import type { BuiltinStoreId, StoreDef, StoreId, Workout } from "@/lib/types";

/** 最初から登録されている店舗（削除不可） */
export const BUILTIN_STORES: (StoreDef & { id: BuiltinStoreId })[] = [
  { id: "ichijoji", name: "LifeFit一乗寺店", shortName: "一乗寺" },
  { id: "higashiyama-nijo", name: "LifeFit東山二条店", shortName: "東山二条" },
  { id: "sanjo-ohashi", name: "LifeFit三条大橋店", shortName: "三条大橋" },
];

/** 後方互換 */
export const STORES = BUILTIN_STORES;

export function isBuiltinStore(id: StoreId): id is BuiltinStoreId {
  return BUILTIN_STORES.some((s) => s.id === id);
}

// 追加した店舗（設定から読み込み、同期的に参照できるよう保持する）
let customStores: StoreDef[] = [];

export function setCustomStores(list: StoreDef[] | undefined) {
  customStores = list ?? [];
}

export function allStores(): StoreDef[] {
  return [...BUILTIN_STORES, ...customStores];
}

export function findStore(id: StoreId): StoreDef | undefined {
  return allStores().find((s) => s.id === id);
}

/** 店舗名から短い表示名を作る（「LifeFit」と末尾の「店」を省く） */
export function shortNameOf(name: string): string {
  const s = name
    .trim()
    .replace(/^LifeFit\s*/i, "")
    .replace(/店$/, "")
    .trim();
  return s || name.trim();
}

export function storeName(id: StoreId, short = false): string {
  const s = findStore(id);
  return s ? (short ? s.shortName : s.name) : id;
}

/** 記録の店舗名（削除した店舗や他の人が追加した店舗は記録時の名前を使う） */
export function workoutStoreName(w: Pick<Workout, "storeId" | "storeLabel">, short = false): string {
  const s = findStore(w.storeId);
  if (s) return short ? s.shortName : s.name;
  if (w.storeLabel) return short ? shortNameOf(w.storeLabel) : w.storeLabel;
  return "その他の店舗";
}

export function newStoreId(): StoreId {
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8);
  return `custom-${rnd}`;
}
