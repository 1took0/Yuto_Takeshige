import type { KV } from "./kv";
import { sanitizeWorkout, type SharedWorkout } from "./sanitize";

/**
 * 記録共有のサーバー側ロジック
 * キー設計:
 *   tc:users            … 共有中の userId の集合
 *   tc:u:{userId}       … プロフィール JSON（表示名・トークンのハッシュ）
 *   tc:w:{userId}       … ハッシュ（workoutId → 記録 JSON）
 * 共有をやめると、その人の記録とプロフィールはサーバーから完全に削除する。
 */
export interface StoredProfile {
  userId: string;
  displayName: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  userId: string;
  displayName: string;
  workoutCount: number;
  lastDate?: string;
  updatedAt: string;
}

export interface FeedItem {
  userId: string;
  displayName: string;
  workout: SharedWorkout;
}

export class ShareError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const USERS = "tc:users";
const uKey = (id: string) => `tc:u:${id}`;
const wKey = (id: string) => `tc:w:${id}`;
export const MAX_WORKOUTS_PER_USER = 1000;
export const MAX_WORKOUT_BYTES = 60_000;

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tc-share:${token}`));
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getProfile(kv: KV, userId: string): Promise<StoredProfile | null> {
  const raw = await kv.get(uKey(userId));
  return raw ? (JSON.parse(raw) as StoredProfile) : null;
}

/** トークンを検証。未登録なら null を返す */
async function authorize(kv: KV, userId: string, token: string): Promise<StoredProfile | null> {
  const p = await getProfile(kv, userId);
  if (!p) return null;
  if (!safeEqual(p.tokenHash, await hashToken(token))) throw new ShareError(403, "この記録を更新する権限がありません");
  return p;
}

/** 共有を開始・表示名を更新する（初回は登録） */
export async function upsertProfile(kv: KV, userId: string, token: string, displayName: string): Promise<StoredProfile> {
  const now = new Date().toISOString();
  const cur = await authorize(kv, userId, token);
  const p: StoredProfile = cur ? { ...cur, displayName, updatedAt: now } : { userId, displayName, tokenHash: await hashToken(token), createdAt: now, updatedAt: now };
  await kv.set(uKey(userId), JSON.stringify(p));
  await kv.sadd(USERS, userId);
  return p;
}

/** 共有をやめる：プロフィールと記録をすべて削除 */
export async function removeUser(kv: KV, userId: string, token: string): Promise<void> {
  const cur = await authorize(kv, userId, token);
  if (!cur) return;
  await kv.del(wKey(userId), uKey(userId));
  await kv.srem(USERS, userId);
}

async function requireProfile(kv: KV, userId: string, token: string) {
  const p = await authorize(kv, userId, token);
  if (!p) throw new ShareError(409, "共有が有効になっていません");
  return p;
}

export async function putWorkouts(kv: KV, userId: string, token: string, inputs: unknown[]): Promise<{ saved: number; rejected: number }> {
  await requireProfile(kv, userId, token);
  const entries: Record<string, string> = {};
  let rejected = 0;
  for (const input of inputs) {
    const w = sanitizeWorkout(input);
    const json = w ? JSON.stringify(w) : "";
    if (!w || json.length > MAX_WORKOUT_BYTES) {
      rejected++;
      continue;
    }
    entries[w.id] = json;
  }
  const ids = Object.keys(entries);
  if (ids.length) {
    const existing = new Set(await kv.hkeys(wKey(userId)));
    const newCount = ids.filter((id) => !existing.has(id)).length;
    if (existing.size + newCount > MAX_WORKOUTS_PER_USER) throw new ShareError(413, "共有できる記録数の上限に達しました");
    await kv.hset(wKey(userId), entries);
  }
  await touch(kv, userId);
  return { saved: ids.length, rejected };
}

export async function deleteWorkouts(kv: KV, userId: string, token: string, workoutIds: string[]): Promise<void> {
  await requireProfile(kv, userId, token);
  if (workoutIds.length) await kv.hdel(wKey(userId), ...workoutIds);
  await touch(kv, userId);
}

/** サーバー側にあって端末に無い記録を削除する（全件同期用） */
export async function pruneWorkouts(kv: KV, userId: string, token: string, keepIds: string[]): Promise<number> {
  await requireProfile(kv, userId, token);
  const keep = new Set(keepIds);
  const stale = (await kv.hkeys(wKey(userId))).filter((id) => !keep.has(id));
  if (stale.length) await kv.hdel(wKey(userId), ...stale);
  return stale.length;
}

async function touch(kv: KV, userId: string) {
  const p = await getProfile(kv, userId);
  if (p) await kv.set(uKey(userId), JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
}

function parseWorkouts(h: Record<string, string>): SharedWorkout[] {
  const out: SharedWorkout[] = [];
  for (const v of Object.values(h)) {
    try {
      const w = sanitizeWorkout(JSON.parse(v));
      if (w) out.push(w);
    } catch {
      /* 壊れたデータは無視 */
    }
  }
  return out.sort((a, b) => (a.trainingDate < b.trainingDate ? 1 : a.trainingDate > b.trainingDate ? -1 : b.startedAt.localeCompare(a.startedAt)));
}

/** 共有中の全員と最近の記録 */
export async function getFeed(kv: KV, limit = 40): Promise<{ users: PublicUser[]; recent: FeedItem[] }> {
  const ids = await kv.smembers(USERS);
  const users: PublicUser[] = [];
  const recent: FeedItem[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const p = await getProfile(kv, id);
      if (!p) return;
      const ws = parseWorkouts(await kv.hgetall(wKey(id)));
      users.push({ userId: id, displayName: p.displayName, workoutCount: ws.length, lastDate: ws[0]?.trainingDate, updatedAt: p.updatedAt });
      for (const w of ws.slice(0, limit)) recent.push({ userId: id, displayName: p.displayName, workout: w });
    }),
  );
  users.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.displayName.localeCompare(b.displayName));
  recent.sort((a, b) => (a.workout.trainingDate < b.workout.trainingDate ? 1 : a.workout.trainingDate > b.workout.trainingDate ? -1 : b.workout.startedAt.localeCompare(a.workout.startedAt)));
  return { users, recent: recent.slice(0, limit) };
}

export async function getUserWorkouts(kv: KV, userId: string): Promise<{ user: PublicUser; workouts: SharedWorkout[] } | null> {
  const p = await getProfile(kv, userId);
  if (!p) return null;
  const ws = parseWorkouts(await kv.hgetall(wKey(userId)));
  return { user: { userId, displayName: p.displayName, workoutCount: ws.length, lastDate: ws[0]?.trainingDate, updatedAt: p.updatedAt }, workouts: ws };
}
