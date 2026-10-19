import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryKV } from "./kv";
import { adminRemoveUser, getFeed, putWorkouts, ShareError, upsertProfile } from "./service";
import { requireOwner } from "./owner";
import { toShareable } from "./client";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { addCardio, newManualWorkout } from "@/lib/workout/edit";

const A = { id: "userAAAA1111", token: "a".repeat(64) };
const B = { id: "userBBBB2222", token: "b".repeat(64) };

describe("作成者によるアカウント削除", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("復元コードが一致したときだけ作成者として扱う", async () => {
    vi.stubEnv("OWNER_RESTORE_CODE", "owner-secret");
    await expect(requireOwner("owner-secret")).resolves.toBeUndefined();
    await expect(requireOwner(" owner-secret ")).resolves.toBeUndefined();
    vi.useFakeTimers();
    const wrong = requireOwner("nope").catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const e = await wrong;
    expect(e).toBeInstanceOf(ShareError);
    expect((e as ShareError).status).toBe(401);
  });

  it("復元コードが未設定なら機能自体が無い（404）", async () => {
    vi.stubEnv("OWNER_RESTORE_CODE", "");
    await expect(requireOwner("anything")).rejects.toMatchObject({ status: 404 });
  });

  it("本人のトークンなしでプロフィールと記録を消し、他の人は残す", async () => {
    const kv = new MemoryKV();
    const ws = buildSeedWorkouts();
    await upsertProfile(kv, A.id, A.token, "古いアカウント");
    await putWorkouts(kv, A.id, A.token, ws.slice(0, 2).map(toShareable));
    await upsertProfile(kv, B.id, B.token, "いまのアカウント");
    expect(await adminRemoveUser(kv, A.id)).toBe(true);
    const feed = await getFeed(kv);
    expect(feed.users.map((u) => u.userId)).toEqual([B.id]);
    expect(feed.recent.every((r) => r.userId !== A.id)).toBe(true);
    // 既に無いアカウントの削除はエラーにしない
    expect(await adminRemoveUser(kv, A.id)).toBe(false);
  });
});

describe("自分でメニューを入力", () => {
  it("空のトレーニングから始め、計画なしの有酸素を追加できる", () => {
    const w = newManualWorkout("ichijoji", "LifeFit 一乗寺店", new Date("2026-10-19T19:00:00+09:00"));
    expect(w.exercises).toEqual([]);
    expect(w.cardio).toEqual([]);
    expect(w.trainingDate).toBe("2026-10-19");
    expect(w.intake).toBeUndefined();
    const w2 = addCardio(addCardio(w, "treadmill"), "bike");
    expect(w2.cardio.map((c) => [c.machine, c.role, c.plan.length])).toEqual([
      ["treadmill", "main", 0],
      ["bike", "main", 0],
    ]);
  });
});
