"use client";
import type { Profile, Workout } from "@/lib/types";
import { getSettings, listCompletedWorkouts, updateSettings } from "@/lib/db/repo";
import type { SharedWorkout } from "./sanitize";
import type { FeedItem, PublicUser } from "./service";

/** 共有前に体調・痛み・メモ（intake）と UI 状態を落とす */
export function toShareable(w: Workout): Omit<Workout, "intake" | "ui"> {
  const { intake: _intake, ui: _ui, ...rest } = w;
  void _intake;
  void _ui;
  return rest;
}

/** 端末ごとのプロフィールを作る（userId とトークンはランダム生成） */
export function createProfile(displayName: string): Profile {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { userId: crypto.randomUUID().replace(/-/g, ""), displayName: displayName.trim(), shareToken: token, createdAt: new Date().toISOString() };
}

export interface ShareStatus {
  enabled: boolean;
  reason?: string;
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `通信エラー (${res.status})`);
  return j as T;
}

export const shareApi = {
  status: () => call<ShareStatus>("/api/share/status", "GET"),
  feed: () => call<{ users: PublicUser[]; recent: FeedItem[] }>("/api/share/feed", "GET"),
  user: (userId: string) => call<{ user: PublicUser; workouts: SharedWorkout[] }>(`/api/share/users/${encodeURIComponent(userId)}`, "GET"),
  register: (p: Profile) => call("/api/share/profile", "PUT", { userId: p.userId, token: p.shareToken, displayName: p.displayName }),
  unregister: (p: Profile) => call("/api/share/profile", "DELETE", { userId: p.userId, token: p.shareToken }),
  put: (p: Profile, ws: Workout[]) => call<{ saved: number; rejected: number }>("/api/share/workouts", "PUT", { userId: p.userId, token: p.shareToken, workouts: ws.map(toShareable) }),
  remove: (p: Profile, ids: string[]) => call("/api/share/workouts", "DELETE", { userId: p.userId, token: p.shareToken, workoutIds: ids }),
  prune: (p: Profile, keepIds: string[]) => call<{ removed: number }>("/api/share/workouts", "POST", { userId: p.userId, token: p.shareToken, keepIds }),
};

const CHUNK = 20;

/** 端末の完了済み記録をすべて共有サーバーに反映（追加・更新・削除） */
export async function fullSync(): Promise<{ count: number }> {
  const s = await getSettings();
  if (!s.sharing || !s.profile) return { count: 0 };
  try {
    await shareApi.register(s.profile);
    const ws = await listCompletedWorkouts();
    for (let i = 0; i < ws.length; i += CHUNK) await shareApi.put(s.profile, ws.slice(i, i + CHUNK));
    await shareApi.prune(s.profile, ws.map((w) => w.id));
    await updateSettings({ shareDirty: false, lastSharedAt: new Date().toISOString() });
    return { count: ws.length };
  } catch (e) {
    await updateSettings({ shareDirty: true });
    throw e;
  }
}

/** 共有を開始 */
export async function enableSharing(): Promise<{ count: number }> {
  await updateSettings({ sharing: true, shareDirty: true });
  return fullSync();
}

/** 共有をやめる：サーバー上の自分の記録を削除 */
export async function disableSharing(): Promise<void> {
  const s = await getSettings();
  if (s.profile) await shareApi.unregister(s.profile);
  await updateSettings({ sharing: false, shareDirty: false });
}

// ---------- 変更ごとの送信（短い遅延でまとめる） ----------
const pendingUpsert = new Map<string, Workout>();
const pendingDelete = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** このまとまりの前から未送信があったか（あれば全件同期する） */
let batchNeedsFull: boolean | null = null;
let markPromise: Promise<unknown> = Promise.resolve();

export function queueChange(c: { type: "upsert"; workout: Workout } | { type: "delete"; id: string } | { type: "bulk" }) {
  if (c.type === "bulk") {
    void getSettings().then((s) => {
      if (s.sharing) fullSync().catch(() => {});
    });
    return;
  }
  if (c.type === "upsert") {
    pendingDelete.delete(c.workout.id);
    pendingUpsert.set(c.workout.id, c.workout);
  } else {
    pendingUpsert.delete(c.id);
    pendingDelete.add(c.id);
  }
  if (batchNeedsFull === null) {
    batchNeedsFull = false;
    // 送信前にアプリが閉じられても次回起動時に再送できるよう、先に「未送信あり」を保存する
    markPromise = getSettings().then((s) => {
      if (s.shareDirty) batchNeedsFull = true;
      if (s.sharing) return updateSettings({ shareDirty: true });
    });
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

async function flush() {
  timer = null;
  await markPromise;
  const full = batchNeedsFull;
  batchNeedsFull = null;
  const ups = [...pendingUpsert.values()];
  const dels = [...pendingDelete];
  pendingUpsert.clear();
  pendingDelete.clear();
  const s = await getSettings();
  if (!s.sharing || !s.profile) return;
  try {
    if (full) {
      await fullSync();
      return;
    }
    for (let i = 0; i < ups.length; i += CHUNK) await shareApi.put(s.profile, ups.slice(i, i + CHUNK));
    if (dels.length) await shareApi.remove(s.profile, dels);
    await updateSettings({ shareDirty: false, lastSharedAt: new Date().toISOString() });
  } catch {
    // オフラインなど：shareDirty のまま残し、次回の起動・再接続時に全件同期する
  }
}
