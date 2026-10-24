import { describe, expect, it } from "vitest";
import type { Settings, Workout } from "@/lib/types";
import { automaticCoachInput, buildAutomaticCoachPrompt } from "./automatic";

const settings: Settings = { id: "settings", excludedExerciseIds: [], theme: "system", sound: false, vibration: false, keepAwake: false, updatedAt: "now" };
const workout = (n: number, storeId: string, extra: Partial<Workout> = {}): Workout => ({ id: `${n}`, storeId, trainingDate: `2026-10-${String(n).padStart(2, "0")}`, startedAt: `${n}`, createdAt: "now", updatedAt: "now", status: "completed", source: "app", exercises: [], cardio: [], ...extra });
const input = (workouts: Workout[] = []) => ({ settings, workouts, equipment: [], exercises: [], stores: [{ id: "a", name: "秘密の店舗A", shortName: "A" }, { id: "b", name: "秘密の店舗B", shortName: "B" }] });
const today = "2026-10-25";
describe("AI相談の自動選択", () => {
  it("最終店舗より頻度を優先し、同数なら最後に使った店舗を選ぶ", () => {
    expect(automaticCoachInput(input([workout(20,"a"),workout(22,"a"),workout(23,"b")]), today).options.storeId).toBe("a");
    expect(automaticCoachInput(input([workout(20,"a"),workout(23,"b")]), today).options.storeId).toBe("b");
  });
  it("進行中・未来・非表示・削除店舗を基準にせず、古い記録の件数にも引きずられない", () => {
    const x = input([...Array.from({length:20},(_,i)=>workout(i+1,"b")),workout(23,"a"),workout(24,"a",{status:"active"}),workout(28,"a")]);
    x.settings = {...settings,hiddenStoreIds:["b"]};
    expect(automaticCoachInput(x,today).options.storeId).toBe("a");
    x.workouts = [workout(23,"deleted")];
    expect(automaticCoachInput(x,today).options.storeId).toBe("ichijoji");
    const y=input([...Array.from({length:25},()=>workout(1,"a")),...Array.from({length:20},()=>workout(24,"b"))]);
    expect(automaticCoachInput(y,today).options.storeId).toBe("b");
    expect(buildAutomaticCoachPrompt(y,today).count).toBe(20);
  });
  it("履歴なしは実績を捏造せず、一乗寺の器具を仮プリセットとして渡す", () => {
    const x=input(); const original=JSON.stringify(x);
    const auto=automaticCoachInput(x,today);
    expect(auto.options.storeId).toBe("ichijoji");
    expect(auto.options.referenceReason).toContain("本人の利用実績や器具の確認済み情報ではありません");
    expect(auto.equipment.length).toBeGreaterThan(0);
    const result=buildAutomaticCoachPrompt(x,today);
    expect(result.count).toBe(0);
    expect(result.text).toContain("AIの会話で使う店舗と器具を確認");
    expect(result.text).not.toContain("秘密の店舗");
    expect(JSON.stringify(x)).toBe(original);
  });
});
