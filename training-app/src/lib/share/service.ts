import type { KV } from "./kv";
import { sanitizeWorkout, type SharedWorkout } from "./sanitize";
import { diffDays, trainingDateOf } from "@/lib/date/trainingDay";

/**
 * 記録共有のサーバー側ロジック
 * キー設計:
 *   tc:users            … 共有中の userId の集合
 *   tc:u:{userId}       … プロフィール JSON（表示名・トークンのハッシュ）
 *   tc:w:{userId}       … ハッシュ（workoutId → 記録 JSON）
 *   tc:feed             … ハッシュ（userId → 「みんな」用の要約 JSON）。記録・表示名を書き込むたびにその人の分を作り直す
 * 「みんな」はこの要約をまとめて読むだけなので、人数が増えても Redis のコマンド数は一定（Upstash 無料枠のため）。
 * 共有をやめると、その人の記録・プロフィール・要約はサーバーから完全に削除する。
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
  /** 直近7日（トレーニング日基準）の回数と時間 */
  week?: { sessions: number; totalMin: number; dumbbellMin: number; machineMin: number; cardioMin: number };
  /** 直近28日の日ごとの実施（いつ・どこで・どれくらい） */
  days?: ActivityDay[];
}

export interface ActivityDay {
  date: string;
  storeId: string;
  storeLabel?: string;
  /** その日の合計（分）。時間の記録が無ければ undefined */
  totalMin?: number;
  setCount: number;
  sessions: number;
}

export const ACTIVITY_DAYS = 28;

/** 直近の日ごとの実施をまとめる（同じ日に複数回あれば合算し、店舗は最初の記録） */
export function recentActivity(ws: SharedWorkout[], today = trainingDateOf(), days = ACTIVITY_DAYS): ActivityDay[] {
  const map = new Map<string, ActivityDay>();
  for (const w of ws) {
    const d = diffDays(today, w.trainingDate);
    if (d < 0 || d >= days) continue;
    const cur = map.get(w.trainingDate);
    const min = w.durations?.totalMin;
    if (!cur) map.set(w.trainingDate, { date: w.trainingDate, storeId: w.storeId, storeLabel: w.storeLabel, totalMin: min, setCount: w.setCount, sessions: 1 });
    else map.set(w.trainingDate, { ...cur, totalMin: min !== undefined || cur.totalMin !== undefined ? (cur.totalMin ?? 0) + (min ?? 0) : undefined, setCount: cur.setCount + w.setCount, sessions: cur.sessions + 1 });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function publicUser(p: Pick<StoredProfile, "userId" | "displayName" | "updatedAt">, ws: SharedWorkout[], workoutCount = ws.length): PublicUser {
  return { userId: p.userId, displayName: p.displayName, workoutCount, lastDate: ws[0]?.trainingDate, updatedAt: p.updatedAt, week: weekStats(ws), days: recentActivity(ws) };
}

export function weekStats(ws: SharedWorkout[], today = trainingDateOf()): NonNullable<PublicUser["week"]> {
  const recent = ws.filter((w) => diffDays(today, w.trainingDate) < 7 && diffDays(today, w.trainingDate) >= 0);
  const sum = (k: "totalMin" | "dumbbellMin" | "machineMin" | "cardioMin") => recent.reduce((a, w) => a + (w.durations?.[k] ?? 0), 0);
  return { sessions: recent.length, totalMin: sum("totalMin"), dumbbellMin: sum("dumbbellMin"), machineMin: sum("machineMin"), cardioMin: sum("cardioMin") };
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
const FEED = "tc:feed";
/** 「みんな」の最近のトレーニングに出す件数（要約にも各自この件数まで持つ） */
export const FEED_RECENT = 40;
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
  await refreshFeedEntry(kv, p);
  return p;
}

/** 共有をやめる：プロフィールと記録をすべて削除 */
export async function removeUser(kv: KV, userId: string, token: string): Promise<void> {
  const cur = await authorize(kv, userId, token);
  if (!cur) return;
  await kv.del(wKey(userId), uKey(userId));
  await kv.srem(USERS, userId);
  await kv.hdel(FEED, userId);
}

/** 作成者による削除：本人のトークンなしでプロフィールと記録を削除（呼び出し側で作成者確認済みであること） */
export async function adminRemoveUser(kv: KV, userId: string): Promise<boolean> {
  const cur = await getProfile(kv, userId);
  await kv.del(wKey(userId), uKey(userId));
  await kv.srem(USERS, userId);
  await kv.hdel(FEED, userId);
  return !!cur;
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
  if (stale.length) {
    await kv.hdel(wKey(userId), ...stale);
    const p = await getProfile(kv, userId);
    if (p) await refreshFeedEntry(kv, p);
  }
  return stale.length;
}

/** 更新日時を新しくし、「みんな」用の要約を作り直す */
async function touch(kv: KV, userId: string) {
  const p = await getProfile(kv, userId);
  if (!p) return;
  const next = { ...p, updatedAt: new Date().toISOString() };
  await kv.set(uKey(userId), JSON.stringify(next));
  await refreshFeedEntry(kv, next);
}

/** 「みんな」用の要約（1人分）。表示名と、最近の記録（直近28日分と、新しい順に40件）だけを持つ */
interface FeedEntry {
  userId: string;
  displayName: string;
  updatedAt: string;
  workoutCount: number;
  workouts: SharedWorkout[];
}

function feedEntryOf(p: StoredProfile, all: SharedWorkout[], today = trainingDateOf()): FeedEntry {
  // 日ごとの表（28日）・直近7日・最近のトレーニングに要る分だけ。時間が経つと表から外れるだけなので、読むときに今日で数え直せる
  const workouts = all.filter((w, i) => i < FEED_RECENT || diffDays(today, w.trainingDate) < ACTIVITY_DAYS);
  return { userId: p.userId, displayName: p.displayName, updatedAt: p.updatedAt, workoutCount: all.length, workouts };
}

async function refreshFeedEntry(kv: KV, p: StoredProfile): Promise<FeedEntry> {
  const entry = feedEntryOf(p, parseWorkouts(await kv.hgetall(wKey(p.userId))));
  await kv.hset(FEED, { [p.userId]: JSON.stringify(entry) });
  return entry;
}

function parseFeedEntry(raw: string | undefined): FeedEntry | null {
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as FeedEntry;
    if (typeof e?.userId !== "string" || typeof e.displayName !== "string" || !Array.isArray(e.workouts)) return null;
    const workouts = e.workouts.map((w) => sanitizeWorkout(w)).filter((w): w is SharedWorkout => !!w);
    return { ...e, workouts: sortWorkouts(workouts) };
  } catch {
    return null;
  }
}

function sortWorkouts(ws: SharedWorkout[]): SharedWorkout[] {
  return ws.sort((a, b) => (a.trainingDate < b.trainingDate ? 1 : a.trainingDate > b.trainingDate ? -1 : b.startedAt.localeCompare(a.startedAt)));
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
  return sortWorkouts(out);
}

/**
 * 共有中の全員と最近の記録
 * 要約（tc:feed）と共有中の一覧（tc:users）の2コマンドだけで作る。人数が増えてもコマンド数は変わらない
 * （要約がまだ無い人＝この仕組みの前から共有している人は、その場で1度だけ作る）
 */
export async function getFeed(kv: KV, limit = FEED_RECENT): Promise<{ users: PublicUser[]; recent: FeedItem[] }> {
  const [ids, feed] = await Promise.all([kv.smembers(USERS), kv.hgetall(FEED)]);
  const users: PublicUser[] = [];
  const recent: FeedItem[] = [];
  await Promise.all(
    ids.map(async (id) => {
      let entry = parseFeedEntry(feed[id]);
      if (!entry) {
        const p = await getProfile(kv, id);
        if (!p) return;
        entry = await refreshFeedEntry(kv, p);
      }
      users.push(publicUser(entry, entry.workouts, entry.workoutCount));
      for (const w of entry.workouts.slice(0, limit)) recent.push({ userId: id, displayName: entry.displayName, workout: w });
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
  return { user: publicUser({ ...p, userId }, ws), workouts: ws };
}
