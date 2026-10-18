import { describe, expect, it } from "vitest";
import { buildSeedWorkouts } from "./history";

describe("seed history", () => {
  const ws = buildSeedWorkouts();
  it("12回分のトレーニングが取り込まれる", () => {
    expect(ws.map((w) => w.trainingDate)).toEqual([
      "2026-09-20", "2026-09-26", "2026-09-27", "2026-09-29", "2026-09-30", "2026-10-03",
      "2026-10-05", "2026-10-06", "2026-10-10", "2026-10-13", "2026-10-15", "2026-10-16",
    ]);
    expect(ws.every((w) => w.status === "completed" && w.source === "import")).toBe(true);
  });
  it("反復回数は推測で補完しない", () => {
    for (const w of ws) for (const e of w.exercises) for (const s of e.sets) expect(s.actualReps).toBeUndefined();
  });
  it("不明な重量は undefined のまま", () => {
    const w = ws.find((x) => x.trainingDate === "2026-10-15")!;
    const ab = w.exercises.find((e) => e.exerciseId === "abductor")!;
    expect(ab.sets.map((s) => s.weight)).toEqual([40, 45, undefined]);
  });
  it("片手種目は左右の重量を持つ", () => {
    const w = ws.find((x) => x.trainingDate === "2026-10-16")!;
    const h = w.exercises.find((e) => e.exerciseId === "db_hammer_curl_single")!;
    expect(h.sets).toHaveLength(3);
    expect(h.sets[0].left?.weight).toBe(5);
    expect(h.sets[0].right?.weight).toBe(5);
  });
  it("有酸素の実績は計画と区別して保存される", () => {
    const w = ws.find((x) => x.trainingDate === "2026-10-16")!;
    const tm = w.cardio.find((c) => c.machine === "treadmill")!;
    expect(tm.plan).toEqual([]);
    expect(tm.actual).toMatchObject({ totalMin: 25, runMin: 9, runSpeedKmh: 12 });
  });
  it("ID は決定的", () => {
    expect(buildSeedWorkouts()[0].id).toBe(ws[0].id);
  });
});
