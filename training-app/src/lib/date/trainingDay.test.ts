import { describe, expect, it } from "vitest";
import { diffDays, formatDuration, shiftYMD, trainingDateOf, weekStartOf } from "./trainingDay";

describe("trainingDateOf (Asia/Tokyo, 6時区切り)", () => {
  it("10/14 01:00 JST は 10/13 として扱う", () => {
    // 2026-10-14T01:00+09:00 = 2026-10-13T16:00Z
    expect(trainingDateOf(new Date("2026-10-13T16:00:00Z"))).toBe("2026-10-13");
  });
  it("10/14 05:59 JST は 10/13", () => {
    expect(trainingDateOf(new Date("2026-10-13T20:59:00Z"))).toBe("2026-10-13");
  });
  it("10/14 06:00 JST は 10/14", () => {
    expect(trainingDateOf(new Date("2026-10-13T21:00:00Z"))).toBe("2026-10-14");
  });
  it("10/14 23:30 JST は 10/14", () => {
    expect(trainingDateOf(new Date("2026-10-14T14:30:00Z"))).toBe("2026-10-14");
  });
  it("月またぎ: 11/1 02:00 JST は 10/31", () => {
    expect(trainingDateOf(new Date("2026-10-31T17:00:00Z"))).toBe("2026-10-31");
  });
  it("年またぎ: 1/1 03:00 JST は 12/31", () => {
    expect(trainingDateOf(new Date("2026-12-31T18:00:00Z"))).toBe("2026-12-31");
  });
});

describe("date helpers", () => {
  it("shiftYMD / diffDays", () => {
    expect(shiftYMD("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-18", "2026-10-16")).toBe(2);
  });
  it("weekStartOf は月曜", () => {
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12"); // 10/18 は日曜
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12");
  });
  it("formatDuration", () => {
    expect(formatDuration(92)).toBe("01:32");
    expect(formatDuration(0)).toBe("00:00");
  });
});
