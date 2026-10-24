import { db } from "./index";
import type { CardioChoice, ExerciseDef, PreferenceNote, Settings, StoreDef, StoreEquipment, StoreId, Workout } from "@/lib/types";
import { applyWishOps, type WishOp } from "@/lib/preferences";
import { newId } from "@/lib/id";
import { defaultStoreEquipment, equipmentForNewStore } from "@/lib/catalog/storeEquipmentDefaults";
import { defaultStoreId, isBuiltinStore, newStoreId, setCustomStores, shortNameOf } from "@/lib/catalog/stores";
import { EXERCISES, HIDDEN_BY_DEFAULT, allExercises, buildCustomExercise, getExercise, newCustomExerciseId, setCustomExercises, setDeletedExercises, type CustomExerciseInput } from "@/lib/catalog/exercises";
import type { TimerHistoryEntry, TimerType } from "@/lib/timer/presets";
import { addToHistory } from "@/lib/timer/presets";
import type { TimerSegment } from "@/lib/timer/engine";

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  theme: "system",
  lastTimeLimitMin: 90,
  sound: true,
  vibration: true,
  keepAwake: true,
  excludedExerciseIds: [],
  updatedAt: new Date(0).toISOString(),
};

export async function getSettings(): Promise<Settings> {
  const s = await db().settings.get("settings");
  const merged = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
  setCustomStores(merged.customStores, merged.hiddenStoreIds);
  setCustomExercises(merged.customExercises);
  setDeletedExercises(merged.deletedExerciseIds, merged.restoredExerciseIds);
  return merged;
}

// 設定の更新は「読んで→書く」なので、同時に呼ばれても順番に処理して更新が消えないようにする
let settingsQueue: Promise<unknown> = Promise.resolve();

export function updateSettings(patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)): Promise<Settings> {
  const run = () => db().transaction("rw", db().settings, async () => {
    const cur = await getSettings();
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch), id: "settings" as const, updatedAt: new Date().toISOString() };
    await db().settings.put(next);
    // 追加した店舗・種目をすぐに参照できるようにする（画面の再描画を待たない）
    setCustomStores(next.customStores, next.hiddenStoreIds);
    setCustomExercises(next.customExercises);
    setDeletedExercises(next.deletedExerciseIds, next.restoredExerciseIds);
    return next;
  });
  const p = settingsQueue.then(run, run);
  settingsQueue = p.catch(() => undefined);
  return p;
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
    // 追加した店舗にも、カタログに増えた器具の行を「未確認」で補う（画面の表示とメニュー作成の判定を揃える）
    const custom = ((await db().settings.get("settings"))?.customStores ?? []).flatMap((s) => equipmentForNewStore(s.id));
    const missing = [...defaultStoreEquipment(), ...custom].filter((r) => !existing.has(r.key));
    if (missing.length) await db().storeEquipment.bulkPut(missing);
  }
}

/** 取り込み済みの過去記録の件数 */
export async function countImportedSeed(): Promise<number> {
  return (await db().workouts.toArray()).filter((w) => w.source === "import").length;
}

export async function bulkPutWorkouts(ws: Workout[]): Promise<void> {
  await db().workouts.bulkPut(ws);
  notify({ type: "bulk" });
}

/** 記録を取り込む（同じIDがあれば上書きしない）。追加件数を返す */
export async function importWorkouts(ws: Workout[]): Promise<number> {
  const existing = new Set((await db().workouts.toArray()).map((w) => w.id));
  const toAdd = ws.filter((w) => !existing.has(w.id));
  if (toAdd.length) await bulkPutWorkouts(toAdd);
  return toAdd.length;
}

// ---------- Workouts ----------
export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db().workouts.where("status").equals("active").first();
}

export async function saveWorkout(w: Workout): Promise<void> {
  const next = { ...w, updatedAt: new Date().toISOString() };
  await db().workouts.put(next);
  if (next.status === "completed") {
    notify({ type: "upsert", workout: next });
    await confirmEquipmentFromWorkout(next);
  }
}

/** 実際に行った種目の器具は、その店舗に「ある」と確認済みにする（追加した店舗の「未確認」を記録から埋める） */
async function confirmEquipmentFromWorkout(w: Workout): Promise<void> {
  const ids = new Set(w.exercises.filter((e) => e.sets.some((s) => s.completed && !s.excluded)).map((e) => getExercise(e.exerciseId)?.equipmentId).filter((x): x is string => !!x && x !== "other"));
  for (const c of w.cardio) if (c.completed && !c.skipped) ids.add(c.machine);
  for (const equipmentId of ids) {
    const cur = await db().storeEquipment.get(`${w.storeId}:${equipmentId}`);
    if (cur && !cur.confirmed) await setStoreEquipment(w.storeId, equipmentId, { available: true, confirmed: true });
  }
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

export async function setStoreEquipment(storeId: StoreId, equipmentId: string, patch: Partial<Pick<StoreEquipment, "available" | "confirmed" | "note" | "stepKg">>): Promise<void> {
  const key = `${storeId}:${equipmentId}`;
  const database = db();
  // メニュー・設定画面・実績確認が同時に更新しても、刻みや器具情報を消さない。
  await database.transaction("rw", database.storeEquipment, async () => {
    const cur = await database.storeEquipment.get(key);
    await database.storeEquipment.put({
      key,
      storeId,
      equipmentId,
      available: cur?.available ?? true,
      confirmed: cur?.confirmed ?? false,
      stepKg: cur?.stepKg,
      note: cur?.note,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
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
  // いまの店舗でまだ一度も記録していない人（LifeFit を使わない人）は、追加した店舗を次の既定にする
  const current = s.lastStoreId ?? defaultStoreId();
  const usedCurrent = (await db().workouts.where("storeId").equals(current).count()) > 0;
  await updateSettings({ customStores: [...list, store], ...(usedCurrent ? {} : { lastStoreId: store.id }) });
  return store;
}

/** 標準店舗を表示しない／表示する（記録と器具の設定は残る） */
export async function setStoreHidden(id: StoreId, hidden: boolean): Promise<void> {
  if (!isBuiltinStore(id)) return;
  const s = await getSettings();
  const cur = new Set(s.hiddenStoreIds ?? []);
  if (hidden) cur.add(id);
  else cur.delete(id);
  await updateSettings({ hiddenStoreIds: [...cur], lastStoreId: hidden && s.lastStoreId === id ? undefined : s.lastStoreId });
}

export async function renameStore(id: StoreId, name: string): Promise<void> {
  const n = name.trim().slice(0, 30);
  if (!n || isBuiltinStore(id)) return;
  const s = await getSettings();
  await updateSettings({ customStores: (s.customStores ?? []).map((x) => (x.id === id ? { ...x, name: n, shortName: shortNameOf(n) } : x)) });
  // 記録に添えた店舗名も新しい名前にする（削除後や他の人の端末でも新しい名前で見えるように）
  const ws = await db().workouts.where("storeId").equals(id).toArray();
  if (ws.length) {
    await db().workouts.bulkPut(ws.map((w) => ({ ...w, storeLabel: n })));
    notify({ type: "bulk" });
  }
}

/** 追加した店舗を削除する。記録は残し、店舗名を記録側に保存しておく */
export async function deleteStore(id: StoreId): Promise<void> {
  if (isBuiltinStore(id)) return;
  const s = await getSettings();
  const store = (s.customStores ?? []).find((x) => x.id === id);
  if (!store) return;
  const ws = await db().workouts.where("storeId").equals(id).toArray();
  if (ws.length) await db().workouts.bulkPut(ws.map((w) => ({ ...w, storeLabel: store.name })));
  await db().storeEquipment.where("storeId").equals(id).delete();
  await updateSettings({ customStores: (s.customStores ?? []).filter((x) => x.id !== id), lastStoreId: s.lastStoreId === id ? undefined : s.lastStoreId });
}

export async function countWorkoutsAtStore(id: StoreId): Promise<number> {
  return db().workouts.where("storeId").equals(id).count();
}

// ---------- 自作の種目 ----------
export async function addCustomExercise(input: CustomExerciseInput): Promise<ExerciseDef> {
  const name = input.name.trim();
  if (!name) throw new Error("種目名を入力してください");
  const s = await getSettings();
  if (allExercises().some((e) => e.name === name)) throw new Error("同じ名前の種目があります");
  const def = buildCustomExercise(input, newCustomExerciseId());
  await updateSettings({ customExercises: [...(s.customExercises ?? []), def] });
  return def;
}

export async function updateCustomExercise(id: string, input: CustomExerciseInput): Promise<void> {
  const s = await getSettings();
  const name = input.name.trim();
  if (!name) throw new Error("種目名を入力してください");
  if (allExercises().some((e) => e.name === name && e.id !== id)) throw new Error("同じ名前の種目があります");
  await updateSettings({ customExercises: (s.customExercises ?? []).map((e) => (e.id === id ? buildCustomExercise(input, id) : e)) });
}

/** 自作種目を削除する（過去の記録は種目名ごと残る） */
export async function deleteCustomExercise(id: string): Promise<void> {
  const s = await getSettings();
  await updateSettings({
    customExercises: (s.customExercises ?? []).filter((e) => e.id !== id),
    excludedExerciseIds: s.excludedExerciseIds.filter((x) => x !== id),
    goals: s.goals ? { ...s.goals, favoriteExerciseIds: s.goals.favoriteExerciseIds.filter((x) => x !== id) } : s.goals,
  });
}

/**
 * 種目を一覧から削除する
 * - 自作の種目はそのまま削除
 * - 標準の種目は「削除した種目」として隠す（メニューの自動作成・種目の追加に出なくなる。設定から元に戻せる）
 * どちらも過去の記録は種目名ごと残る
 */
export async function deleteExercise(id: string): Promise<void> {
  const s = await getSettings();
  if ((s.customExercises ?? []).some((e) => e.id === id)) return deleteCustomExercise(id);
  if (!EXERCISES.some((e) => e.id === id)) return;
  await updateSettings({
    deletedExerciseIds: [...new Set([...(s.deletedExerciseIds ?? []), id])],
    restoredExerciseIds: (s.restoredExerciseIds ?? []).filter((x) => x !== id),
    goals: s.goals ? { ...s.goals, favoriteExerciseIds: s.goals.favoriteExerciseIds.filter((x) => x !== id) } : s.goals,
    // 「自動メニューから除外する種目」も種目一覧に合わせる
    excludedExerciseIds: s.excludedExerciseIds.filter((x) => x !== id),
  });
}

/** 削除した標準の種目を一覧に戻す */
export async function restoreExercise(id: string): Promise<void> {
  const s = await getSettings();
  await updateSettings({
    deletedExerciseIds: (s.deletedExerciseIds ?? []).filter((x) => x !== id),
    // 最初は一覧に無い種目は「加えた」ことを覚えておく
    restoredExerciseIds: HIDDEN_BY_DEFAULT.has(id) ? [...new Set([...(s.restoredExerciseIds ?? []), id])] : s.restoredExerciseIds,
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

export async function rememberIntakeDefaults(storeId: StoreId, timeLimitMin: number | null, cardio: CardioChoice) {
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

// ---------- Timer history ----------

const TIMER_HISTORY_KEY = "timerHistory";

export async function getTimerHistory(): Promise<TimerHistoryEntry[]> {
  return (await kvGet<TimerHistoryEntry[]>(TIMER_HISTORY_KEY)) ?? [];
}

export async function recordTimerUse(type: TimerType, segments: TimerSegment[], title?: string): Promise<void> {
  await kvSet(TIMER_HISTORY_KEY, addToHistory(await getTimerHistory(), type, segments, title));
}

export async function deleteTimerHistory(id: string): Promise<void> {
  await kvSet(TIMER_HISTORY_KEY, (await getTimerHistory()).filter((e) => e.id !== id));
}

// ---------- メニューの希望 ----------
const MAX_NOTES = 30;

/** 伝えられた希望を保存し、以降のメニュー作成に反映する。反映内容を返す */
export async function saveWish(text: string, ops: WishOp[]): Promise<string[]> {
  if (!ops.length) return [];
  const s = await getSettings();
  const { goals, prefs, changes } = applyWishOps(s.goals, s.preferences, ops);
  const note: PreferenceNote = { id: newId("wish"), text: text.trim().slice(0, 200), changes, createdAt: new Date().toISOString() };
  // 有酸素・時間の希望は、毎回のヒアリングの初期値にも反映する
  const defaults: Partial<Settings> = {};
  for (const op of ops) {
    if (op.kind === "cardio") defaults.lastCardio = op.value;
    if (op.kind === "time") defaults.lastTimeLimitMin = op.minutes;
  }
  await updateSettings({ goals, preferences: { ...prefs, notes: [note, ...(prefs.notes ?? [])].slice(0, MAX_NOTES) }, ...defaults });
  return changes;
}
