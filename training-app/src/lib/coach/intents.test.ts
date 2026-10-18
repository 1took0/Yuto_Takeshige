import { describe, expect, it } from "vitest";
import { parseIntent, respond } from "./intents";
import { applyPlanPatch } from "./applyPatch";
import { generatePlan } from "@/lib/planner";
import { buildSeedWorkouts } from "@/lib/seed/history";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { availableExercises } from "@/lib/planner";
import { toggleSetCompleted } from "@/lib/workout/edit";

const history = buildSeedWorkouts();
const equipment = defaultStoreEquipment();
const availableIds = new Set(availableExercises(equipment, "ichijoji").map((a) => a.def.id));
function plan() {
  return generatePlan({
    intake: { storeId: "ichijoji", timeLimitMin: 90, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "run" },
    history,
    storeEquipment: equipment,
    settings: { excludedExerciseIds: [] },
    now: new Date("2026-10-18T10:00:00+09:00"),
  }).workout;
}

describe("parseIntent", () => {
  it("定型文を解釈する", () => {
    expect(parseIntent("ジムに来た", null).type).toBe("start_session");
    expect(parseIntent("今日は脚が疲れている", null)).toEqual({ type: "fatigue", regions: ["legs"] });
    expect(parseIntent("あと20分しかない", null)).toEqual({ type: "time_left", minutes: 20 });
    expect(parseIntent("あと２０分", null)).toEqual({ type: "time_left", minutes: 20 });
    expect(parseIntent("レッグプレスのマシンがない", null)).toMatchObject({ type: "no_machine", exerciseId: "leg_press" });
    expect(parseIntent("チェストプレスの重量を上げてもいい？", null)).toMatchObject({ type: "weight_question", exerciseId: "chest_press" });
    expect(parseIntent("今日はランニングをやめたい", null).type).toBe("stop_running");
    expect(parseIntent("ハンマーカールを追加して", null)).toEqual({ type: "add_exercise", exerciseId: "db_hammer_curl_single" });
    expect(parseIntent("こんにちは", null).type).toBe("unknown");
  });
});

describe("respond + applyPlanPatch", () => {
  it("「あと20分」で予定が短縮され、実績は変更されない", () => {
    let w = plan();
    const ex = w.exercises[0];
    w = toggleSetCompleted(w, ex.id, ex.sets[0].id); // 1セット実施済み
    const reply = respond(parseIntent("あと20分しかない", w), w, { history, availableIds });
    expect(reply.patch).toBeDefined();
    const r = applyPlanPatch(w, reply.patch!);
    const after = r.workout;
    // 実施済みセットは残る
    const exAfter = after.exercises.find((e) => e.id === ex.id)!;
    expect(exAfter.sets[0].completed).toBe(true);
    // 種目数は減る（または除外される）
    const pendingBefore = w.exercises.filter((e) => e.sets.some((s) => !s.completed && !s.excluded)).length;
    const pendingAfter = after.exercises.filter((e) => e.sets.some((s) => !s.completed && !s.excluded)).length;
    expect(pendingAfter).toBeLessThan(pendingBefore);
  });

  it("「ランニングをやめたい」でトレッドミルがウォーキングになる", () => {
    const w = plan();
    const reply = respond(parseIntent("今日はランニングをやめたい", w), w, { history, availableIds });
    const after = applyPlanPatch(w, reply.patch!).workout;
    const tm = after.cardio.find((c) => c.machine === "treadmill")!;
    expect(tm.plan.some((s) => s.kind === "run")).toBe(false);
    expect(tm.plan.length).toBeGreaterThan(0);
  });

  it("「マシンがない」で代替種目に置き換わる", () => {
    const w = plan();
    const reply = respond(parseIntent("レッグプレスのマシンがない", w), w, { history, availableIds });
    const after = applyPlanPatch(w, reply.patch!).workout;
    expect(after.exercises.some((e) => e.exerciseId === "leg_press")).toBe(false);
  });

  it("重量の質問は実回数が無ければ上げず、理由を説明する", () => {
    const w = plan();
    const reply = respond(parseIntent("チェストプレスの重量を上げてもいい？", w), w, { history, availableIds });
    expect(reply.patch).toBeUndefined();
    expect(reply.message).toMatch(/実回数/);
  });

  it("脚の疲労で負荷が下がりランニングがウォーキングに", () => {
    const w = plan();
    const reply = respond(parseIntent("今日は脚が疲れている", w), w, { history, availableIds });
    const after = applyPlanPatch(w, reply.patch!).workout;
    const lp = after.exercises.find((e) => e.exerciseId === "leg_press")!;
    const before = w.exercises.find((e) => e.exerciseId === "leg_press")!;
    expect(lp.sets[lp.sets.length - 1].weight!).toBeLessThan(before.sets[before.sets.length - 1].weight!);
    expect(after.cardio.find((c) => c.machine === "treadmill")!.plan.some((s) => s.kind === "run")).toBe(false);
  });

  it("set_sets は実施済みセットより少なくできない", () => {
    let w = plan();
    const ex = w.exercises[0];
    w = toggleSetCompleted(w, ex.id, ex.sets[0].id);
    w = toggleSetCompleted(w, ex.id, ex.sets[1].id);
    const r = applyPlanPatch(w, { message: "", ops: [{ op: "set_sets", exerciseId: ex.exerciseId, sets: 1 }] });
    expect(r.skipped).toHaveLength(1);
    expect(r.workout.exercises[0].sets.filter((s) => s.completed)).toHaveLength(2);
  });
});
