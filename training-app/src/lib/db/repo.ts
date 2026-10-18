import { db } from "./index";
import type { CardioPreference, Settings, StoreDef, StoreEquipment, StoreId, Workout } from "@/lib/types";
import { defaultStoreEquipment, equipmentForNewStore } from "@/lib/catalog/storeEquipmentDefaults";
import { isBuiltinStore, newStoreId, setCustomStores, shortNameOf } from "@/lib/catalog/stores";
import { SEED_VERSION, buildSeedWorkouts } from "@/lib/seed/history";

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  theme: "system",
  lastStoreId: "ichijoji",
  lastTimeLimitMin: 90,
  lastCardio: "run",
  sound: true,
  vibration: true,
  keepAwake: true,
  excludedExerciseIds: [],
  updatedAt: new Date(0).toISOString(),
};

export async function getSettings(): Promise<Settings> {
  const s = await db().settings.get("settings");
  const merged = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
  setCustomStores(merged.customStores);
  return merged;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch, id: "settings" as const, updatedAt: new Date().toISOString() };
  await db().settings.put(next);
  return next;
}

// ---------- 変更通知（記録共有の同期に使う） ----------
type WorkoutChange = { type: "upsert"; workout: Workout } | { type: "delete"; id: string } | { type: "bulk" };
let changeListener: ((c: WorkoutChange) => void) | null = null;
export function setWorkoutChangeListener(fn: ((c: WorkoutChange) => void) | null) {
  changeListener = fn;
}
function notify(c: WorkoutChange) {
  try {
    changeListener?.(c);
  } catch (e) {
    console.warn("change listener failed", e);
  }
}

/** 起動時に器具一覧を投入する（履歴は自動では取り込まない） */
export async function ensureSeeded(): Promise<void> {
  const equipCount = await db().storeEquipment.count();
  if (equipCount === 0) {
    await db().storeEquipment.bulkPut(defaultStoreEquipment());
  } else {
    // 新しい器具がカタログに追加された場合は、既存の設定を壊さずに追加だけする
    const existing = new Set((await db().storeEquipment.toArray()).map((r) => r.key));
    const missing = defaultStoreEquipment().filter((r) => !existing.has(r.key));
    if (missing.length) await db().storeEquipment.bulkPut(missing);
  }
}

/** 既存履歴（アプリ作成者の記録）を取り込む。初回設定で本人が選んだ場合のみ */
export async function importSeedHistory(): Promise<number> {
  const seeds = buildSeedWorkouts();
  const existingIds = new Set((await db().workouts.toArray()).map((w) => w.id));
  const toAdd = seeds.filter((w) => !existingIds.has(w.id));
  if (toAdd.length) await db().workouts.bulkPut(toAdd);
  await updateSettings({ seedVersion: SEED_VERSION });
  if (toAdd.length) notify({ type: "bulk" });
  return toAdd.length;
}

export async function countImportedSeed(): Promise<number> {
  return (await db().workouts.toArray()).filter((w) => w.source === "import").length;
}

export async function bulkPutWorkouts(ws: Workout[]): Promise<void> {
  await db().workouts.bulkPut(ws);
  notify({ type: "bulk" });
}

// ---------- Workouts ----------
export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db().workouts.where("status").equals("active").first();
}

export async function saveWorkout(w: Workout): Promise<void> {
  const next = { ...w, updatedAt: new Date().toISOString() };
  await db().workouts.put(next);
  if (next.status === "completed") notify({ type: "upsert", workout: next });
}

export async function deleteWorkout(id: string): Promise<void> {
  const cur = await db().workouts.get(id);
  await db().workouts.delete(id);
  if (cur?.status === "completed") notify({ type: "delete", id });
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
  return db().workouts.get(id);
}

export async function listCompletedWorkouts(): Promise<Workout[]> {
  const all = await db().workouts.where("status").equals("completed").toArray();
  return all.sort((a, b) => (a.trainingDate < b.trainingDate ? 1 : a.trainingDate > b.trainingDate ? -1 : b.startedAt.localeCompare(a.startedAt)));
}

export async function listAllWorkouts(): Promise<Workout[]> {
  return db().workouts.toArray();
}

// ---------- Store equipment ----------
export async function listStoreEquipment(storeId?: StoreId): Promise<StoreEquipment[]> {
  if (storeId) return db().storeEquipment.where("storeId").equals(storeId).toArray();
  return db().storeEquipment.toArray();
}

export async function setStoreEquipment(storeId: StoreId, equipmentId: string, patch: Partial<Pick<StoreEquipment, "available" | "confirmed" | "note">>): Promise<void> {
  const key = `${storeId}:${equipmentId}`;
  const cur = await db().storeEquipment.get(key);
  await db().storeEquipment.put({
    key,
    storeId,
    equipmentId,
    available: cur?.available ?? true,
    confirmed: cur?.confirmed ?? false,
    note: cur?.note,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

// ---------- Stores ----------
/** 店舗を追加する。copyFromStoreId を指定するとその店舗の器具の有無を引き継ぐ（すべて未確認扱い） */
export async function addStore(name: string, copyFromStoreId?: StoreId): Promise<StoreDef> {
  const n = name.trim().slice(0, 30);
  if (!n) throw new Error("店舗名を入力してください");
  const s = await getSettings();
  const list = s.customStores ?? [];
  if ([...list].some((x) => x.name === n)) throw new Error("同じ名前の店舗があります");
  const store: StoreDef = { id: newStoreId(), name: n, shortName: shortNameOf(n), custom: true };
  const copy = copyFromStoreId ? await listStoreEquipment(copyFromStoreId) : undefined;
  await db().storeEquipment.bulkPut(equipmentForNewStore(store.id, copy));
  await updateSettings({ customStores: [...list, store] });
  return store;
}

export async function renameStore(id: StoreId, name: string): Promise<void> {
  const n = name.trim().slice(0, 30);
  if (!n || isBuiltinStore(id)) return;
  const s = await getSettings();
  await updateSettings({ customStores: (s.customStores ?? []).map((x) => (x.id === id ? { ...x, name: n, shortName: shortNameOf(n) } : x)) });
}

/** 追加した店舗を削除する。記録は残し、店舗名を記録側に保存しておく */
export async function deleteStore(id: StoreId): Promise<void> {
  if (isBuiltinStore(id)) return;
  const s = await getSettings();
  const store = (s.customStores ?? []).find((x) => x.id === id);
  if (!store) return;
  const ws = (await db().workouts.where("storeId").equals(id).toArray()).filter((w) => !w.storeLabel);
  if (ws.length) await db().workouts.bulkPut(ws.map((w) => ({ ...w, storeLabel: store.name })));
  await db().storeEquipment.where("storeId").equals(id).delete();
  await updateSettings({ customStores: (s.customStores ?? []).filter((x) => x.id !== id), lastStoreId: s.lastStoreId === id ? "ichijoji" : s.lastStoreId });
}

export async function countWorkoutsAtStore(id: StoreId): Promise<number> {
  return db().workouts.where("storeId").equals(id).count();
}

// ---------- KV ----------
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db().kv.get(key);
  return row?.value as T | undefined;
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await db().kv.put({ key, value, updatedAt: new Date().toISOString() });
}
export async function kvDelete(key: string): Promise<void> {
  await db().kv.delete(key);
}

export async function rememberIntakeDefaults(storeId: StoreId, timeLimitMin: number | null, cardio: CardioPreference) {
  await updateSettings({ lastStoreId: storeId, lastTimeLimitMin: timeLimitMin, lastCardio: cardio });
}

/** 全データ削除（設定画面から明示的に実行） */
export async function wipeAll(): Promise<void> {
  await db().transaction("rw", db().workouts, db().storeEquipment, db().settings, db().kv, async () => {
    await db().workouts.clear();
    await db().storeEquipment.clear();
    await db().settings.clear();
    await db().kv.clear();
  });
}
