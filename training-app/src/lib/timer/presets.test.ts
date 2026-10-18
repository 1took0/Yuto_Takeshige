import { describe, expect, it } from "vitest";
import { addToHistory, autoTitle, buildCountdown, buildInterval, historySegments, MAX_HISTORY, parseInterval } from "./presets";

describe("インターバル・タイマー", () => {
  it("準備 →（運動→休憩）×回数、最後の休憩は無し", () => {
    const s = buildInterval({ prepSec: 5, workSec: 40, restSec: 20, rounds: 3 });
    expect(s.map((x) => `${x.label}:${x.durationSec}`)).toEqual(["準備:5", "運動 1/3:40", "休憩 1/3:20", "運動 2/3:40", "休憩 2/3:20", "運動 3/3:40"]);
    expect(autoTitle("interval", s)).toBe("運動40秒／休憩20秒 ×3");
    expect(parseInterval(s)).toEqual({ prepSec: 5, workSec: 40, restSec: 20, rounds: 3 });
  });
  it("休憩0・準備0も可", () => {
    const s = buildInterval({ prepSec: 0, workSec: 90, restSec: 0, rounds: 2 });
    expect(s).toHaveLength(2);
    expect(autoTitle("interval", s)).toBe("運動01:30 ×2");
  });
  it("通常のタイマー", () => {
    expect(buildCountdown(150)[0].durationSec).toBe(150);
    expect(autoTitle("countdown", buildCountdown(150))).toBe("タイマー 02:30");
  });
});

describe("タイマー履歴", () => {
  it("同じ設定はまとめて先頭へ、回数を数える。名前を付けられる", () => {
    let h = addToHistory([], "countdown", buildCountdown(90));
    h = addToHistory(h, "interval", buildInterval({ prepSec: 0, workSec: 30, restSec: 30, rounds: 5 }), "脚サーキット");
    h = addToHistory(h, "countdown", buildCountdown(90));
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ type: "countdown", title: "タイマー 01:30", useCount: 2 });
    expect(h[1]).toMatchObject({ type: "interval", title: "脚サーキット", useCount: 1 });
    // 呼び出すと区間に新しい id が振られる
    const segs = historySegments(h[1]);
    expect(segs).toHaveLength(9);
    expect(segs[0].id).toBeTruthy();
  });
  it("件数の上限", () => {
    let h = addToHistory([], "countdown", buildCountdown(1));
    for (let i = 2; i < MAX_HISTORY + 10; i++) h = addToHistory(h, "countdown", buildCountdown(i));
    expect(h).toHaveLength(MAX_HISTORY);
  });
});
