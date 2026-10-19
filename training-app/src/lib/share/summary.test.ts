import { describe, expect, it } from "vitest";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { toShareable } from "./client";
import { sanitizeWorkout } from "./sanitize";
import { MemoryKV } from "./kv";
import { getFeed, getUserWorkouts, putWorkouts, recentActivity, upsertProfile } from "./service";
import type { Workout } from "@/lib/types";
import { trainingDateOf } from "@/lib/date/trainingDay";

const A = { id: "userAAAA1111", token: "a".repeat(64) };

function withDurations(w: Workout, totalMin: number): Workout {
  return { ...w, durations: { totalMin, machineMin: totalMin - 10, cardioMin: 10 } };
}

describe("共有は要約だけ（誰が・いつ・どこで・どれくらい）", () => {
  const w = withDurations(buildSeedWorkouts()[0], 55);

  it("送る内容に種目名・重量・回数・体調メモを含めない", () => {
    const s = toShareable({ ...w, intake: { storeId: w.storeId, timeLimitMin: 60, condition: 2, soreness: true, soreRegions: ["legs"], pain: { present: true, description: "腰が痛い" }, focus: "auto", cardio: "walk", memo: "ひみつ" }, notes: "メモ" });
    const json = JSON.stringify(s);
    expect(json).not.toContain(w.exercises[0].name);
    expect(json).not.toContain("weight");
    expect(json).not.toContain("腰が痛い");
    expect(json).not.toContain("メモ");
    expect(s).toMatchObject({ id: w.id, trainingDate: w.trainingDate, storeId: w.storeId, durations: { totalMin: 55 } });
    expect(s.setCount).toBeGreaterThan(0);
    expect(s.exerciseCount).toBeGreaterThan(0);
    expect(Object.keys(s)).not.toContain("exercises");
  });

  it("以前の形式（種目の詳細つき）で届いても、要約だけにして保存・返却する", async () => {
    const legacy = { ...w, intake: undefined, ui: undefined, storeLabel: "LifeFit 一乗寺店" };
    const s = sanitizeWorkout(JSON.parse(JSON.stringify(legacy)))!;
    expect(s).not.toBeNull();
    expect(JSON.stringify(s)).not.toContain(w.exercises[0].name);
    expect(s.setCount).toBe(toShareable(w).setCount);
    expect(s.exerciseCount).toBe(toShareable(w).exerciseCount);

    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    await putWorkouts(kv, A.id, A.token, [legacy]);
    const raw = await kv.hgetall(`tc:w:${A.id}`);
    expect(Object.values(raw).join("")).not.toContain(w.exercises[0].name);
    const r = await getUserWorkouts(kv, A.id);
    expect(JSON.stringify(r)).not.toContain(w.exercises[0].name);
  });

  it("日ごとの実施をまとめ、フィードに直近28日分を付ける", async () => {
    const base = toShareable(w);
    const days = recentActivity(
      [
        { ...base, id: "a", trainingDate: "2026-10-18", storeId: "ichijoji", setCount: 10, durations: { totalMin: 40 } },
        { ...base, id: "b", trainingDate: "2026-10-18", storeId: "sanjo-ohashi", setCount: 5, durations: { totalMin: 20 } },
        { ...base, id: "c", trainingDate: "2026-10-10", storeId: "sanjo-ohashi", setCount: 8, durations: undefined },
        { ...base, id: "d", trainingDate: "2026-09-01", setCount: 8 },
      ],
      "2026-10-19",
    );
    expect(days).toEqual([
      { date: "2026-10-10", storeId: "sanjo-ohashi", storeLabel: base.storeLabel, totalMin: undefined, setCount: 8, sessions: 1 },
      { date: "2026-10-18", storeId: "ichijoji", storeLabel: base.storeLabel, totalMin: 60, setCount: 15, sessions: 2 },
    ]);

    const kv = new MemoryKV();
    await upsertProfile(kv, A.id, A.token, "Aさん");
    await putWorkouts(kv, A.id, A.token, [toShareable({ ...w, trainingDate: trainingDateOf() })]);
    const feed = await getFeed(kv);
    expect(feed.users[0].days).toEqual([expect.objectContaining({ date: trainingDateOf(), totalMin: 55, sessions: 1 })]);
    expect(JSON.stringify(feed)).not.toContain(w.exercises[0].name);
  });
});
