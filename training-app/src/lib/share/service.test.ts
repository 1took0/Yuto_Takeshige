import { describe, expect, it, vi } from "vitest";
import { MemoryKV, UpstashKV, FileKV } from "./kv";
import { deleteWorkouts, getFeed, getUserWorkouts, pruneWorkouts, putWorkouts, removeUser, ShareError, upsertProfile } from "./service";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { toShareable } from "./client";
import { sanitizeWorkout } from "./sanitize";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const A = { id: "userAAAA1111", token: "a".repeat(64) };
const B = { id: "userBBBB2222", token: "b".repeat(64) };
const ws = buildSeedWorkouts();

describe("share service", () => {
  it("登録 → 記録送信 → フィードに表示", async () => {
    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    const r = await putWorkouts(kv, A.id, A.token, ws.slice(0, 3).map(toShareable));
    expect(r).toEqual({ saved: 3, rejected: 0 });
    const feed = await getFeed(kv);
    expect(feed.users).toEqual([expect.objectContaining({ userId: A.id, displayName: "Aさん", workoutCount: 3, lastDate: "2026-09-27" })]);
    expect(feed.recent[0].workout.trainingDate).toBe("2026-09-27");
    // トークンのハッシュはレスポンスに含まれない
    expect(JSON.stringify(feed)).not.toContain("tokenHash");
  });

  it("他人のトークンでは更新・削除できない", async () => {
    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    await expect(putWorkouts(kv, A.id, B.token, [toShareable(ws[0])])).rejects.toBeInstanceOf(ShareError);
    await expect(removeUser(kv, A.id, B.token)).rejects.toMatchObject({ status: 403 });
    await expect(upsertProfile(kv, A.id, B.token, "乗っ取り")).rejects.toMatchObject({ status: 403 });
    // 未登録ユーザーは記録を送れない
    await expect(putWorkouts(kv, B.id, B.token, [toShareable(ws[0])])).rejects.toMatchObject({ status: 409 });
  });

  it("共有をやめると記録もプロフィールも消える", async () => {
    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    await upsertProfile(kv, B.id, B.token, "Bさん");
    await putWorkouts(kv, A.id, A.token, ws.map(toShareable));
    await removeUser(kv, A.id, A.token);
    const feed = await getFeed(kv);
    expect(feed.users.map((u) => u.userId)).toEqual([B.id]);
    expect(await getUserWorkouts(kv, A.id)).toBeNull();
  });

  it("削除と全件同期（prune）", async () => {
    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    await putWorkouts(kv, A.id, A.token, ws.slice(0, 4).map(toShareable));
    await deleteWorkouts(kv, A.id, A.token, [ws[0].id]);
    expect((await getUserWorkouts(kv, A.id))!.workouts).toHaveLength(3);
    expect(await pruneWorkouts(kv, A.id, A.token, [ws[1].id])).toBe(2);
    expect((await getUserWorkouts(kv, A.id))!.workouts.map((w) => w.id)).toEqual([ws[1].id]);
  });

  it("不正な記録は拒否し、体調などの intake は共有しない", async () => {
    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    const withIntake = { ...ws[0], intake: { condition: 2, pain: { present: true, description: "腰" } } };
    const r = await putWorkouts(kv, A.id, A.token, [toShareable(withIntake as never), { id: "x", trainingDate: "bad" }, { ...toShareable(ws[1]), status: "active" }]);
    expect(r).toEqual({ saved: 1, rejected: 2 });
    const stored = (await getUserWorkouts(kv, A.id))!.workouts[0];
    expect(JSON.stringify(stored)).not.toContain("腰");
    // 未知のフィールドもサーバー側で落とす
    expect(sanitizeWorkout({ ...toShareable(ws[0]), evil: "<script>" })).not.toHaveProperty("evil");
  });
});

describe("KV adapters", () => {
  it("Upstash REST: コマンドを JSON 配列で送り、HGETALL を復元", async () => {
    const calls: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      const result = body[0] === "HGETALL" ? ["w1", "{}", "w2", "[]"] : body[0] === "SMEMBERS" ? ["u1"] : "OK";
      return new Response(JSON.stringify({ result }), { status: 200 });
    });
    const kv = new UpstashKV("https://example.upstash.io/", "tok", fetchMock as unknown as typeof fetch);
    await kv.hset("h", { a: "1", b: "2" });
    expect(await kv.hgetall("h")).toEqual({ w1: "{}", w2: "[]" });
    expect(await kv.smembers("s")).toEqual(["u1"]);
    expect(calls[0]).toEqual(["HSET", "h", "a", "1", "b", "2"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.upstash.io");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("Upstash エラーは例外になる", async () => {
    const kv = new UpstashKV("https://x", "t", (async () => new Response(JSON.stringify({ error: "WRONGPASS" }), { status: 401 })) as unknown as typeof fetch);
    await expect(kv.get("k")).rejects.toThrow(/WRONGPASS/);
  });

  it("ファイル保存は再読み込み後も残る", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tc-")), "share.json");
    const kv1 = new FileKV(file);
    await upsertProfile(kv1, A.id, A.token, "Aさん");
    await putWorkouts(kv1, A.id, A.token, [toShareable(ws[0])]);
    const kv2 = new FileKV(file);
    expect((await getFeed(kv2)).users[0]).toMatchObject({ displayName: "Aさん", workoutCount: 1 });
  });
});
