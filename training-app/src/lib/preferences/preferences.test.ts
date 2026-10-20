import { describe, expect, it } from "vitest";
import { applyWishOps, needsFirstHearing } from "./index";
import { isStandingWish, parseWish } from "./parse";
import { detectWish, respondToWish } from "@/lib/coach/wish";
import { DEFAULT_GOALS } from "@/lib/goals";
import { generatePlan } from "@/lib/planner";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import type { IntakeAnswers } from "@/lib/types";

describe("希望の解析", () => {
  it("種目の好き嫌い", () => {
    expect(parseWish("次からスクワットはやりたくない")).toEqual([{ kind: "dislike_exercise", exerciseId: "db_goblet_squat" }]);
    expect(parseWish("ハンマーカールは好き")).toEqual([{ kind: "like_exercise", exerciseId: "db_hammer_curl_single" }]);
    // 対象と気持ちが読点で分かれていても読める
    expect(parseWish("レッグプレスは、苦手です")).toEqual([{ kind: "dislike_exercise", exerciseId: "leg_press" }]);
  });

  it("正式名を優先して取り違えない", () => {
    expect(parseWish("ダンベルショルダープレスをやりたい")).toEqual([{ kind: "like_exercise", exerciseId: "db_shoulder_press" }]);
  });

  it("部位は多め・控えめを区別し、1文に複数あっても読む", () => {
    expect(parseWish("今後は腕を多めにして、脚は控えめにしたい")).toEqual([
      { kind: "more_region", region: "arms" },
      { kind: "less_region", region: "legs" },
    ]);
  });

  it("有酸素・器具・時間・強度", () => {
    expect(parseWish("有酸素はいらない")).toEqual([{ kind: "cardio", value: "none" }]);
    expect(parseWish("次からランニングはやめたい")).toEqual([{ kind: "cardio", value: "walk" }]);
    expect(parseWish("マシン中心がいい")).toEqual([{ kind: "equipment", value: "machine" }]);
    expect(parseWish("いつも45分くらいで")).toEqual([{ kind: "time", minutes: 45 }]);
    expect(parseWish("もっと追い込みたい")).toEqual([{ kind: "intensity", value: "hard" }]);
    expect(parseWish("少し物足りない")).toEqual([{ kind: "intensity", value: "hard" }]);
  });

  it("今日だけの相談は今後の希望として扱わない", () => {
    expect(isStandingWish("今日は脚が疲れている")).toBe(false);
    expect(detectWish("今日はランニングをやめたい")).toBeNull();
    expect(detectWish("あと20分しかない")).toBeNull();
    expect(detectWish("次からランニングはやめたい")).toEqual([{ kind: "cardio", value: "walk" }]);
  });
});

describe("希望の反映", () => {
  it("矛盾する以前の希望を打ち消す", () => {
    const a = applyWishOps(DEFAULT_GOALS, {}, [{ kind: "like_exercise", exerciseId: "leg_press" }, { kind: "more_region", region: "legs" }]);
    expect(a.goals.favoriteExerciseIds).toContain("leg_press");
    expect(a.goals.priorityRegions).toContain("legs");
    const b = applyWishOps(a.goals, a.prefs, [{ kind: "dislike_exercise", exerciseId: "leg_press" }, { kind: "less_region", region: "legs" }]);
    expect(b.goals.favoriteExerciseIds).not.toContain("leg_press");
    expect(b.prefs.dislikedExerciseIds).toEqual(["leg_press"]);
    expect(b.goals.priorityRegions).not.toContain("legs");
    expect(b.prefs.lessRegions).toEqual(["legs"]);
    expect(b.changes).toEqual(["レッグプレスは自動作成で選ばない", "脚は控えめにする"]);
  });

  it("ダンベル中心はダンベル優先の目標にも反映", () => {
    expect(applyWishOps(DEFAULT_GOALS, {}, [{ kind: "equipment", value: "dumbbell" }]).goals.preferDumbbell).toBe(true);
    expect(applyWishOps({ ...DEFAULT_GOALS, preferDumbbell: true }, {}, [{ kind: "equipment", value: "machine" }]).goals.preferDumbbell).toBe(false);
  });

  it("初回ヒアリングは、未回答かつ記録が無いときだけ", () => {
    expect(needsFirstHearing(undefined, 0)).toBe(true);
    expect(needsFirstHearing({ answeredAt: "2026-10-19T00:00:00Z" }, 0)).toBe(false);
    // 過去の記録を取り込んだ人には聞かない
    expect(needsFirstHearing(undefined, 12)).toBe(false);
  });
});

describe("メニュー作成への反映", () => {
  const equipment = defaultStoreEquipment();
  const now = new Date("2026-10-18T10:00:00+09:00");
  const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };
  const plan = (prefs: Parameters<typeof generatePlan>[0]["settings"]["preferences"], i: Partial<IntakeAnswers> = {}, goals = DEFAULT_GOALS) =>
    generatePlan({ intake: { ...intake, ...i }, history: [], storeEquipment: equipment, settings: { excludedExerciseIds: [], goals, preferences: prefs }, now });

  it("やりたくない種目は選ばず、同じ枠の別の種目を使う", () => {
    const base = plan({});
    expect(base.workout.exercises.some((e) => e.exerciseId === "leg_press")).toBe(true);
    const w = plan({ dislikedExerciseIds: ["leg_press"] }).workout;
    expect(w.exercises.some((e) => e.exerciseId === "leg_press")).toBe(false);
    // 同じ枠の別の種目（ダンベル・スミス・バーベルのスクワット）が入る
    expect(w.exercises.some((e) => ["db_goblet_squat", "smith_squat", "bb_squat"].includes(e.exerciseId))).toBe(true);
  });

  it("控えたい部位は減り、多めにしたい部位は増える", () => {
    const count = (w: ReturnType<typeof plan>["workout"], ids: string[]) => w.exercises.filter((e) => ids.includes(e.exerciseId)).length;
    const legIds = ["leg_press", "db_goblet_squat", "leg_curl", "db_rdl", "leg_extension", "adductor", "calf_raise"];
    expect(count(plan({ lessRegions: ["legs"] }).workout, legIds)).toBeLessThan(count(plan({}).workout, legIds));
  });

  it("有酸素なしならトレッドミルを入れず、その分を筋トレに回す", () => {
    const withCardio = plan({}, { cardio: "walk" });
    const none = plan({ cardio: "none" }, { cardio: "none" });
    expect(none.workout.cardio.some((c) => c.machine === "treadmill")).toBe(false);
    expect(none.summary.some((s) => s.includes("有酸素なし"))).toBe(true);
    expect(none.workout.exercises.length).toBeGreaterThanOrEqual(withCardio.workout.exercises.length);
  });

  it("はじめての人は種目数とセット数を抑え、マシンを優先", () => {
    const w = plan({ experience: "new" }, { timeLimitMin: 90 }).workout;
    expect(w.exercises.length).toBeLessThanOrEqual(6);
    expect(w.exercises.every((e) => e.sets.length <= 3)).toBe(true);
    expect(w.exercises.find((e) => e.exerciseId === "leg_press")?.rationale).toContain("フォームを優先");
  });

  it("軽めの希望なら回数多め・セット少なめ、追い込みたいなら主要種目のセットが増える", () => {
    const normal = plan({ intensity: "normal" }, { timeLimitMin: null }).workout;
    const light = plan({ intensity: "light" }, { timeLimitMin: null }).workout;
    const hard = plan({ intensity: "hard" }, { timeLimitMin: null }).workout;
    const sets = (w: typeof normal, id: string) => w.exercises.find((e) => e.exerciseId === id)!.sets.length;
    const reps = (w: typeof normal, id: string) => w.exercises.find((e) => e.exerciseId === id)!.sets.at(-1)!.reps!;
    expect(sets(light, "chest_press")).toBeLessThan(sets(normal, "chest_press"));
    expect(reps(light, "chest_press")).toBeGreaterThan(reps(normal, "chest_press"));
    expect(sets(hard, "chest_press")).toBeGreaterThan(sets(normal, "chest_press"));
  });

  it("普段から気をつけたい痛みは毎回考慮する", () => {
    const w = plan({ chronicPain: "膝が弱い" });
    expect(w.workout.exercises.some((e) => e.exerciseId === "leg_extension" || e.exerciseId === "leg_press")).toBe(false);
    expect(w.warnings.some((x) => x.includes("膝"))).toBe(true);
  });

  it("反映した希望を要約に出す", () => {
    const r = plan({ intensity: "light", lessRegions: ["arms"], dislikedExerciseIds: ["plank"] });
    const line = r.summary.find((s) => s.startsWith("希望を反映"))!;
    expect(line).toContain("軽め・フォーム重視");
    expect(line).toContain("控えめ：腕");
    expect(line).toContain("除外：プランク");
  });
});

describe("今後の希望（この種目は外したい）への返答", () => {
  it("進行中メニューの未着手の種目は今日からも外す", () => {
    const w = generatePlan({
      intake: { storeId: "ichijoji", timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" },
      history: [],
      storeEquipment: defaultStoreEquipment(),
      settings: { excludedExerciseIds: [] },
      now: new Date("2026-10-18T10:00:00+09:00"),
    }).workout;
    const r = respondToWish([{ kind: "dislike_exercise", exerciseId: "leg_press" }], w);
    expect(r.message).toContain("次回以降のメニューに反映します");
    expect(r.patch?.ops).toEqual([{ op: "remove_exercise", exerciseId: "leg_press", reason: "本人の希望" }]);
  });
});
