import { describe, expect, it } from "vitest";
import { comebackAdjust, detectComeback, parseComeback } from "./comeback";
import { generatePlan } from "./index";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { parseIntent, respond } from "@/lib/coach/intents";
import type { IntakeAnswers, Workout } from "@/lib/types";

describe("久しぶりの読み取り", () => {
  it("言い方と空いた期間", () => {
    expect(parseComeback("久しぶりのトレーニングです")).toEqual({});
    expect(parseComeback("2週間ぶり")).toEqual({ days: 14 });
    expect(parseComeback("１か月休んでた")).toEqual({ days: 30 });
    expect(parseComeback("三ヶ月ぶりに来ました")).toEqual({ days: 90 });
    expect(parseComeback("10日空いた")).toEqual({ days: 10 });
    expect(parseComeback("しばらく行けてなかった")).toEqual({});
    expect(parseComeback("今日は脚が疲れている")).toBeNull();
    expect(parseComeback("あと20分しかない")).toBeNull();
  });

  it("空いた期間が長いほど大きく下げ、長いときはセットも減らす", () => {
    expect(comebackAdjust(10).loadFactor).toBe(0.9);
    expect(comebackAdjust(undefined).loadFactor).toBe(0.85);
    expect(comebackAdjust(30)).toMatchObject({ loadFactor: 0.75, setsDelta: -1 });
    expect(comebackAdjust(90)).toMatchObject({ loadFactor: 0.65, setsDelta: -1 });
  });

  it("何も言わなくても2週間以上空いたら軽めにする。メモで伝えたらそれを優先", () => {
    expect(detectComeback(5)).toBeNull();
    expect(detectComeback(20)?.loadFactor).toBe(0.85);
    expect(detectComeback(5, "久しぶり")?.loadFactor).toBe(0.85);
    expect(detectComeback(5, "2か月ぶり")?.loadFactor).toBe(0.65);
  });
});

describe("メニュー作成への反映", () => {
  const history = buildSeedWorkouts();
  const equipment = defaultStoreEquipment();
  const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };
  const lpLast = (w: Workout) => w.exercises.find((e) => e.exerciseId === "leg_press")!.sets.at(-1)!.weight!;

  it("前回から1か月空いたら重量を下げ、セット数も減らし、要約に理由を出す", () => {
    const normal = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now: new Date("2026-10-18T10:00:00+09:00") });
    const later = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now: new Date("2026-11-20T10:00:00+09:00") });
    expect(lpLast(later.workout)).toBeLessThan(lpLast(normal.workout));
    const sets = (w: Workout) => w.exercises.find((e) => e.exerciseId === "leg_press")!.sets.length;
    expect(sets(later.workout)).toBeLessThan(sets(normal.workout));
    expect(later.summary.some((s) => s.includes("ぶり"))).toBe(true);
  });

  it("空いていなくても、メモで「久しぶり」と書けば軽めにする", () => {
    const now = new Date("2026-10-18T10:00:00+09:00");
    const normal = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    const said = generatePlan({ intake: { ...intake, memo: "久しぶりです" }, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    expect(lpLast(said.workout)).toBeLessThan(lpLast(normal.workout));
  });
});

describe("コーチのチャット", () => {
  it("「久しぶりにジムに来た」はヒアリングへ進み、メモに引き継ぐ", () => {
    const r = respond(parseIntent("久しぶりにジムに来た", null), null, { history: [], availableIds: new Set() });
    expect(r.navigate).toContain("/start?memo=");
    expect(decodeURIComponent(r.navigate!)).toContain("久しぶり");
  });

  it("トレーニング中に「1か月ぶり」と伝えると、未着手の種目の重量とセット数を下げる", () => {
    const w = generatePlan({
      intake: { storeId: "ichijoji", timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" },
      history: buildSeedWorkouts(),
      storeEquipment: defaultStoreEquipment(),
      settings: { excludedExerciseIds: [] },
      now: new Date("2026-10-18T10:00:00+09:00"),
    }).workout;
    const r = respond(parseIntent("実は1か月ぶりなんです", w), w, { history: [], availableIds: new Set() });
    expect(r.message).toContain("約1か月ぶり");
    expect(r.patch?.ops.some((o) => o.op === "set_weight")).toBe(true);
    expect(r.patch?.ops.some((o) => o.op === "set_sets")).toBe(true);
  });

  it("トレーニング前なら、次のメニューを軽めにするためヒアリングへ進む", () => {
    const r = respond(parseIntent("2週間ぶりです", null), null, { history: [], availableIds: new Set() });
    expect(r.navigate).toContain("/start?memo=");
  });
});
