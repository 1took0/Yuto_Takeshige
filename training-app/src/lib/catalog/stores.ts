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

// 追加した店舗と、表示しない標準店舗（設定から読み込み、同期的に参照できるよう保持する）
let customStores: StoreDef[] = [];
let hiddenIds = new Set<string>();

export function setCustomStores(list: StoreDef[] | undefined, hidden?: StoreId[]) {
  customStores = list ?? [];
  hiddenIds = new Set(hidden ?? []);
}

/** 選べる店舗（表示しない標準店舗を除く） */
export function allStores(): StoreDef[] {
  return [...BUILTIN_STORES.filter((s) => !hiddenIds.has(s.id)), ...customStores];
}

/** 表示しない店舗も含めた全店舗（記録の店舗名の解決用） */
export function allStoresIncludingHidden(): StoreDef[] {
  return [...BUILTIN_STORES, ...customStores];
}

export function isStoreHidden(id: StoreId): boolean {
  return hiddenIds.has(id);
}

export function findStore(id: StoreId): StoreDef | undefined {
  return allStoresIncludingHidden().find((s) => s.id === id);
}

/**
 * 次に使う店舗：前回の店舗が選べればそれ、無ければ追加した店舗の先頭、それも無ければ選べる店舗の先頭
 * LifeFit を使わない人が追加した店舗を既定にできるよう、"ichijoji" に固定しない
 */
export function defaultStoreId(lastStoreId?: StoreId): StoreId {
  const stores = allStores();
  if (lastStoreId && stores.some((s) => s.id === lastStoreId)) return lastStoreId;
  return stores.find((s) => s.custom)?.id ?? stores[0]?.id ?? BUILTIN_STORES[0].id;
}

/** 店舗名から短い表示名を作る（よくあるジム名の接頭辞と末尾の「店」を省き、長ければ8文字まで） */
export function shortNameOf(name: string): string {
  const s = name
    .trim()
    .replace(/^(LifeFit|ライフフィット|エニタイムフィットネス|エニタイム|ゴールドジム|ジョイフィット|JOYFIT|chocoZAP|チョコザップ|FIT365|コナミスポーツクラブ|ティップネス|セントラルスポーツ)\s*/i, "")
    .replace(/店$/, "")
    .trim();
  const out = s || name.trim();
  return out.length > 8 ? `${out.slice(0, 8)}…` : out;
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
