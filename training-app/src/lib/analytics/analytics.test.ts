import { describe, expect, it } from "vitest";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { epley, lateralDifference, regionFrequency, restDayCalendar, runTrend, volumeTrend, weightTrend } from "./index";
import { cardioToCSV, setsToCSV, toJSON, parseImport } from "@/lib/export";

const ws = buildSeedWorkouts();

describe("analytics", () => {
  it("重量推移は店舗ごとに系列が分かれ、実回数が無い場合は e1RM を計算しない", () => {
    const t = weightTrend(ws, "leg_press");
    expect(t.length).toBeGreaterThan(5);
    expect(new Set(t.map((p) => p.series)).size).toBe(2); // 一乗寺・東山二条
    expect(t.every((p) => p.e1rm === undefined)).toBe(true);
    expect(t[t.length - 1]).toMatchObject({ date: "2026-10-16", storeId: "higashiyama-nijo", workingWeight: 45, maxWeight: 45 });
  });
  it("epley", () => {
    expect(epley(50, 10)).toBeCloseTo(66.7, 1);
    expect(epley(50, 1)).toBe(50);
  });
  it("総セット数と部位頻度", () => {
    const v = volumeTrend(ws);
    expect(v[v.length - 1].totalSets).toBe(29);
    expect(v.every((x) => x.tonnage === undefined)).toBe(true);
    const r = regionFrequency(ws, 28, "2026-10-18");
    expect(r.find((x) => x.region === "legs")!.sets).toBeGreaterThan(0);
    expect(r.find((x) => x.region === "legs")!.daysSince).toBe(2);
  });
  it("左右差・ランニング推移・休息日", () => {
    const l = lateralDifference(ws);
    expect(l.find((x) => x.exerciseId === "db_hammer_curl_single")).toMatchObject({ left: 5, right: 5, date: "2026-10-16" });
    const r = runTrend(ws);
    const last = r[r.length - 1];
    expect(last).toMatchObject({ date: "2026-10-16", runMin: 9, speed: 12, distanceKm: 1.8 });
    const cal = restDayCalendar(ws, 7, "2026-10-18");
    expect(cal.map((d) => d.trained)).toEqual([false, true, false, true, true, false, false]);
  });
});

describe("export", () => {
  it("CSV と JSON の往復", () => {
    const csv = setsToCSV(ws);
    expect(csv.split("\n").length).toBeGreaterThan(100);
    expect(csv).toContain("2026-10-16,東山二条,import_2026-10-16_higashiyama-nijo,leg_press,レッグプレス,1,40");
    const c = cardioToCSV(ws);
    expect(c).toContain("treadmill,main,true,,,,25,9,12");
    const json = toJSON(ws, []);
    const back = parseImport(json);
    expect(back.workouts).toHaveLength(12);
    expect(() => parseImport("{}")).toThrow();
  });
});
