import { describe, expect, it } from "vitest";
import { buildAiCoachPrompt, type AiCoachInput } from "./export";
import type { Workout } from "@/lib/types";

const workout = (date = "2026-10-20", storeId = "gym-a"): Workout => ({
  id: `private-workout-${date}`, trainingDate: date, startedAt: `${date}T10:00:00Z`,
  createdAt: date, updatedAt: date, storeId, storeLabel: "秘密の店舗", status: "completed", source: "app",
  notes: "履歴の秘密メモ", intake: { storeId, timeLimitMin: 60, condition: 2, soreness: true,
    soreRegions: ["legs"], pain: { present: true, description: "当日の秘密の痛み" }, focus: "auto", cardio: "none", memo: "開始時秘密メモ" },
  exercises: [{ id: "ex-instance", exerciseId: "synthetic", name: "テスト種目", primary: [], restSec: 60, status: "done", note: "種目秘密メモ",
    sets: [
      { id: "set-a", weight: 10, reps: 12, plannedReps: 12, completed: true, excluded: false, note: "セット秘密メモ" },
      { id: "set-b", weight: 0, reps: 12, actualReps: 0, completed: true, excluded: false, left: { weight: 6, reps: 12, actualReps: 8 }, right: { weight: 6, reps: 12 } },
      { id: "set-c", reps: 12, actualReps: 5, completed: true, excluded: true },
      { id: "set-d", seconds: 30, completed: false, excluded: false },
    ] }],
  cardio: [{ id: "cardio-instance", machine: "treadmill", role: "main", completed: false, skipped: true,
    plan: [{ id: "segment", kind: "walk", durationSec: 300, speedKmh: 5, inclinePct: 0 }], actual: { totalMin: 2, note: "有酸素秘密メモ" } }],
  itemOrder: ["cardio-instance", "ex-instance"],
});

const fixture = (): AiCoachInput => ({
  settings: { id: "settings", theme: "system", sound: false, vibration: false, keepAwake: false, excludedExerciseIds: [], updatedAt: "now",
    profile: { userId: "private-user", displayName: "秘密の氏名", shareToken: "secret-token", createdAt: "now" },
    preferences: { age: 37, bodyWeightKg: 73, chronicPain: "普段の秘密の痛み", notes: [{ id: "private-note", text: "希望秘密メモ", changes: ["変更秘密メモ"], createdAt: "now" }] } },
  workouts: [workout()], stores: [{ id: "gym-a", name: "秘密の店舗A", shortName: "A" }, { id: "gym-b", name: "秘密の店舗B", shortName: "B" }],
  equipment: [{ key: "gym-a:bodyweight", storeId: "gym-a", equipmentId: "bodyweight", available: true, confirmed: false, updatedAt: "now", note: "器具秘密メモ" }],
  exercises: [],
  options: { historyCount: 8, storeId: "gym-a", trainingDate: "2026-10-25", request: "合う順番を相談したい", todayNotes: "今日は30分だけ",
    includeHealth: false, includeNotes: false, includeStoreNames: false, includeActivePlan: false },
});

function data(input: AiCoachInput) {
  const result = buildAiCoachPrompt(input);
  return JSON.parse(result.text.slice(result.text.indexOf("\n{\n") + 1));
}

describe("AI相談の書き出し", () => {
  it("店舗別の重量を混ぜず、選択範囲内の最新の完了セットだけをまとめる", () => {
    const input = fixture();
    const a = workout("2026-10-20", "gym-a");
    const b = workout("2026-10-21", "gym-b");
    b.exercises[0].sets[0].weight = 40;
    const newer = workout("2026-10-22", "gym-a");
    newer.exercises[0].sets = [{ id: "unreported", completed: true, excluded: false, reps: 12 },
      { id: "excluded", completed: true, excluded: true, weight: 999 },
      { id: "planned", completed: false, excluded: false, weight: 999 }];
    input.workouts = [a, b, newer];
    const rows = data(input).店舗別の重量記録.記録;
    expect(rows).toHaveLength(2);
    expect(rows.find((row: { 店舗: string }) => row.店舗 === "店舗1")).toMatchObject({ 日付: "2026-10-20", セット: [{ 重量kg: 10 }, { 重量kg: 0 }] });
    expect(rows.find((row: { 店舗: string }) => row.店舗 === "店舗2").セット[0].重量kg).toBe(40);
    expect(JSON.stringify(rows)).not.toContain("999");
    expect(buildAiCoachPrompt(input).text).toContain("他店舗の基準を上書きしない");
  });
  it("初期状態ではプロフィール・ID・保存済み健康情報・自由メモを出力しない", () => {
    const input = fixture();
    const text = buildAiCoachPrompt(input).text;
    for (const secret of ["private-", "secret-token", "秘密", "gym-a", "set-a", "ex-instance"]) expect(text).not.toContain(secret);
    expect(text).toContain("今日は30分だけ");
    expect(data(input).保存済みの体格と痛み).toContain("出力しない");
    expect(data(input).店舗の器具[0].状態).toBe("未確認");
  });

  it("健康情報・メモ・店舗名はそれぞれの選択だけで追加され、トークンは常に除外される", () => {
    const input = fixture();
    input.options.includeHealth = true;
    let text = buildAiCoachPrompt(input).text;
    expect(text).toContain("普段の秘密の痛み");
    expect(text).toContain("当日の秘密の痛み");
    expect(text).not.toContain("秘密メモ");
    expect(text).not.toContain("秘密の店舗");
    input.options.includeNotes = true;
    input.options.includeStoreNames = true;
    text = buildAiCoachPrompt(input).text;
    for (const value of ["履歴", "開始時", "種目", "セット", "有酸素", "希望", "変更", "器具"]) expect(text).toContain(`${value}秘密メモ`.replace("履歴秘密", "履歴の秘密"));
    expect(text).toContain("秘密の店舗A");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("秘密の氏名");
  });

  it("予定と実績、未報告とゼロ、左右、除外、スキップ、表示順を保持する", () => {
    const items = data(fixture()).過去の記録[0].順番と内容;
    expect(items[0].有酸素).toBe("トレッドミル");
    expect(items[0].状態).toBe("スキップ");
    expect(items[0].計画区間[0].速度kmh).toBe(5);
    expect(items[0].実績.歩行速度kmh).toBeNull();
    const sets = items[1].セット;
    expect(sets[0].入力回数).toBe(12);
    expect(sets[0].実績回数).toBeNull();
    expect(sets[1].実績回数).toBe(0);
    expect(sets[1].重量kg).toBe(0);
    expect(sets[1].左.実績回数).toBe(8);
    expect(sets[1].右.実績回数).toBeNull();
    expect(sets[2].状態).toBe("除外");
    expect(sets[3].状態).toBe("未完了");
    expect(sets[3].実績秒数).toBeNull();
  });

  it("指定日以前の終了記録を上限内で選び、進行中は別枠にし、入力を変更しない", () => {
    const input = fixture();
    input.options.historyCount = 4;
    const active = { ...workout("2026-10-25"), status: "active" as const };
    input.workouts = [workout("2026-10-26"), workout("2026-10-18"), active,
      workout("2026-10-23", "gym-b"), workout("2026-10-22"), workout("2026-10-21"), workout("2026-10-20")];
    input.activeWorkout = active;
    const before = JSON.stringify(input);
    let result = data(input);
    expect(result.過去の記録.map((w: { 日付: string }) => w.日付)).toEqual(["2026-10-23", "2026-10-22", "2026-10-21", "2026-10-20"]);
    expect(result.今日の条件.店舗).toBe("店舗1");
    expect(result.過去の記録[0].店舗).toBe("店舗2");
    expect(result.過去の記録[1].店舗).toBe("店舗1");
    expect(result.進行中のメニュー).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
    input.options.includeActivePlan = true;
    result = data(input);
    expect(result.進行中のメニュー.状態).toContain("進行中");
    expect(result.進行中のメニュー.店舗).toBe("店舗1");
  });

  it("並べ替え後に追加した種目を画面と同じ位置に出し、種目配列の順番を優先する", () => {
    const input = fixture();
    const w = workout();
    w.itemOrder = ["ex-instance", "cardio-instance"];
    w.exercises.push({ ...w.exercises[0], id: "added", name: "追加した種目" });
    input.workouts = [w];
    const labels = () => data(input).過去の記録[0].順番と内容.map((item: { 種目?: string; 有酸素?: string }) => item.種目 ?? item.有酸素);
    expect(labels()).toEqual(["テスト種目", "追加した種目", "トレッドミル"]);
    // 種目の番号を入れ替えた後の古いitemOrderでも、画面と同じ番号順で出す。
    w.itemOrder = ["ex-instance", "cardio-instance", "added"];
    w.exercises.reverse();
    expect(labels()).toEqual(["追加した種目", "トレッドミル", "テスト種目"]);
  });

  it("履歴がなくても不明を保ち、時間だけの記録に種目を補わない", () => {
    const input = fixture();
    input.workouts = [];
    expect(buildAiCoachPrompt(input).count).toBe(0);
    expect(data(input).今日の条件.体調5段階).toBeNull();
    expect(data(input).今日の条件.時間).toBe("未指定");
    input.options.timeLimitMin = null;
    input.workouts = [{ ...workout(), timeOnly: true, exercises: [], cardio: [], durations: { totalMin: 30 } }];
    expect(data(input).今日の条件.時間).toBe("制限なし");
    expect(data(input).過去の記録[0].順番と内容).toEqual([]);
    expect(data(input).過去の記録[0].記録種別).toContain("時間だけ");
  });
});
