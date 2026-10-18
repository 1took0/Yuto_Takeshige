import { db } from "./index";
import type { CardioPreference, Settings, StoreEquipment, StoreId, Workout } from "@/lib/types";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
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
  return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch, id: "settings" as const, updatedAt: new Date().toISOString() };
  await db().settings.put(next);
  return next;
}

/** 初回起動時に既存履歴と器具一覧を投入する */
export async function ensureSeeded(): Promise<{ seeded: boolean }> {
  const settings = await getSettings();
  const equipCount = await db().storeEquipment.count();
  if (equipCount === 0) {
    await db().storeEquipment.bulkPut(defaultStoreEquipment());
  } else {
    // 新しい器具がカタログに追加された場合は、既存の設定を壊さずに追加だけする
    const existing = new Set((await db().storeEquipment.toArray()).map((r) => r.key));
    const missing = defaultStoreEquipment().filter((r) => !existing.has(r.key));
    if (missing.length) await db().storeEquipment.bulkPut(missing);
  }
  if ((settings.seedVersion ?? 0) >= SEED_VERSION) return { seeded: false };
  const seeds = buildSeedWorkouts();
  const existingIds = new Set((await db().workouts.toArray()).map((w) => w.id));
  const toAdd = seeds.filter((w) => !existingIds.has(w.id));
  if (toAdd.length) await db().workouts.bulkPut(toAdd);
  await updateSettings({ seedVersion: SEED_VERSION });
  return { seeded: toAdd.length > 0 };
}

// ---------- Workouts ----------
export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db().workouts.where("status").equals("active").first();
}

export async function saveWorkout(w: Workout): Promise<void> {
  await db().workouts.put({ ...w, updatedAt: new Date().toISOString() });
}

export async function deleteWorkout(id: string): Promise<void> {
  await db().workouts.delete(id);
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
