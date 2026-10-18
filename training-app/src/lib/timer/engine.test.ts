import { describe, expect, it } from "vitest";
import { adjustCurrentSegment, createTimer, pause, reset, restTimer, resume, settle, shouldNotify, skipToNext, start, view } from "./engine";

const segs = [
  { id: "a", label: "ウォーキング", kind: "walk" as const, durationSec: 60, speedKmh: 5.5 },
  { id: "b", label: "ランニング", kind: "run" as const, durationSec: 120, speedKmh: 12 },
  { id: "c", label: "クールダウン", kind: "cooldown" as const, durationSec: 30 },
];

describe("timer engine (timestamp based)", () => {
  it("開始→経過→一時停止→再開で正しい経過時間", () => {
    const t0 = 1_000_000;
    let t = start(createTimer("x", "test", segs), t0);
    expect(view(t, t0 + 10_000).elapsedSec).toBe(10);
    t = pause(t, t0 + 10_000);
    // 停止中は進まない（スリープ中も同じ）
    expect(view(t, t0 + 50_000).elapsedSec).toBe(10);
    t = resume(t, t0 + 50_000);
    expect(view(t, t0 + 55_000).elapsedSec).toBe(15);
  });

  it("画面スリープ後に再表示しても開始時刻から復元される", () => {
    const t0 = 0;
    const t = start(createTimer("x", "test", segs), t0);
    // 90秒後に再表示（間に tick が無くても正しい）
    const v = view(t, 90_000);
    expect(v.index).toBe(1);
    expect(v.segment?.kind).toBe("run");
    expect(v.segmentElapsedSec).toBe(30);
    expect(v.segmentRemainingSec).toBe(90);
    expect(v.next?.kind).toBe("cooldown");
    expect(v.remainingSec).toBe(120);
  });

  it("合計時間を超えたら finished", () => {
    let t = start(createTimer("x", "test", segs), 0);
    t = settle(t, 300_000);
    expect(t.status).toBe("finished");
    const v = view(t, 400_000);
    expect(v.finished).toBe(true);
    expect(v.remainingSec).toBe(0);
    expect(v.elapsedSec).toBe(210);
  });

  it("区間切替の通知は区間ごとに1回だけ", () => {
    let t = start(createTimer("x", "test", segs), 0);
    expect(shouldNotify(t, 10_000).notify).toBe(false);
    const r = shouldNotify(t, 61_000);
    expect(r).toMatchObject({ notify: true, index: 1 });
    t = { ...t, notifiedIndex: 1 };
    expect(shouldNotify(t, 70_000).notify).toBe(false);
    expect(shouldNotify(settle(t, 211_000), 211_000)).toMatchObject({ notify: true, finished: true });
  });

  it("スキップと時間調整", () => {
    let t = start(createTimer("x", "test", segs), 0);
    t = skipToNext(t, 10_000);
    expect(view(t, 10_000).index).toBe(1);
    expect(view(t, 10_000).segmentElapsedSec).toBe(0);
    t = adjustCurrentSegment(t, 30, 10_000);
    expect(t.segments[1].durationSec).toBe(150);
    t = reset(t, 20_000);
    expect(t.status).toBe("idle");
    expect(view(t, 30_000).elapsedSec).toBe(0);
  });

  it("休憩タイマーは1区間", () => {
    const t = restTimer("rest", 90);
    expect(t.segments).toHaveLength(1);
    expect(view(start(t, 0), 30_000).segmentRemainingSec).toBe(60);
  });

  it("JSON シリアライズ可能", () => {
    const t = start(createTimer("x", "test", segs), 123);
    const back = JSON.parse(JSON.stringify(t));
    expect(view(back, 123 + 5000).elapsedSec).toBe(5);
  });
});
