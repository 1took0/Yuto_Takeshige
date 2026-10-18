import type { BodyRegion, CardioSegment, PlanPatch, Workout } from "@/lib/types";
import { EXERCISES, getExercise } from "@/lib/catalog/exercises";
import { EQUIPMENT } from "@/lib/catalog/equipment";
import { REGION_LABEL } from "@/lib/catalog/muscles";
import { exerciseMinutes } from "@/lib/planner";
import { buildTreadmillPlan } from "@/lib/planner/cardio";
import { allTargetsReported, exerciseHistory, workingWeight } from "@/lib/planner/history";

/**
 * ルールベースの意図解析（APIキー不要）
 * 「ジムに来た」「今日は脚が疲れている」「あと20分しかない」「このマシンがない」
 * 「重量を上げてもいい？」「今日はランニングをやめたい」などに対応する
 */
export type Intent =
  | { type: "start_session"; memo?: string }
  | { type: "fatigue"; regions: BodyRegion[] }
  | { type: "time_left"; minutes: number }
  | { type: "no_machine"; exerciseId?: string; equipmentId?: string }
  | { type: "weight_question"; exerciseId?: string }
  | { type: "stop_running" }
  | { type: "skip_cardio" }
  | { type: "add_exercise"; exerciseId: string }
  | { type: "remove_exercise"; exerciseId: string }
  | { type: "unknown" };

const REGION_WORDS: [RegExp, BodyRegion][] = [
  [/脚|足|太もも|ハム|ふくらはぎ/, "legs"],
  [/尻|臀|ヒップ/, "glutes"],
  [/胸/, "chest"],
  [/背中|背筋|広背/, "back"],
  [/肩/, "shoulders"],
  [/腕|二頭|三頭|前腕/, "arms"],
  [/腹|体幹/, "abs"],
  [/腰/, "lower_back"],
];

function toHalfWidth(s: string) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function findExerciseByText(text: string): string | undefined {
  const t = text.replace(/\s/g, "");
  const aliases: [RegExp, string][] = [
    [/レッグプレス/, "leg_press"],
    [/レッグカール/, "leg_curl"],
    [/レッグエクステンション|エクステンション/, "leg_extension"],
    [/アブダクター|アブダクション/, "abductor"],
    [/アダクター|アダクション|内もも/, "adductor"],
    [/チェストプレス/, "chest_press"],
    [/ペック|フライ/, "pec_fly"],
    [/ラット|プルダウン/, "lat_pulldown"],
    [/ロウ|ローイング/, "seated_row"],
    [/ショルダー/, "shoulder_press"],
    [/アブドミナル|腹筋マシン/, "abdominal"],
    [/ハンマー/, "db_hammer_curl_single"],
    [/ダンベルカール|片手カール/, "db_curl_single"],
    [/バイセップス|アームカール|カールマシン/, "biceps_curl"],
    [/トライセプス|三頭/, "triceps"],
    [/レッグレイズ|ニーレイズ|ニー・レッグレイズ/, "knee_leg_raise"],
    [/サイドプランク/, "side_plank"],
    [/プランク/, "plank"],
    [/ヒップスラスト|グルート/, "hip_thrust"],
    [/バックエクステンション/, "back_extension"],
    [/チンニング|懸垂/, "assisted_chin"],
    [/カーフ/, "calf_raise"],
    [/フェイスプル/, "face_pull"],
    [/パロフ/, "pallof_press"],
  ];
  for (const [re, id] of aliases) if (re.test(t)) return id;
  const hit = EXERCISES.find((e) => t.includes(e.name.replace(/（.*）/, "")));
  return hit?.id;
}

export function parseIntent(raw: string, w: Workout | null): Intent {
  const text = toHalfWidth(raw.trim());
  if (!text) return { type: "unknown" };
  if (/ジムに(来|き)た|トレーニング(を)?(開始|始め|スタート)|始めよう|はじめる/.test(text)) return { type: "start_session" };
  const timeMatch = text.match(/あと\s*(\d+)\s*分|(\d+)\s*分(しか|で|以内)/);
  if (timeMatch) return { type: "time_left", minutes: Number(timeMatch[1] ?? timeMatch[2]) };
  if (/ランニング.*(やめ|なし|しない|無し|止め)|走(ら|り)たくない|走るのをやめ|歩きだけ|ウォーキングだけ/.test(text)) return { type: "stop_running" };
  if (/有酸素.*(やめ|なし|しない|無し)|トレッドミル.*(やめ|なし|しない)|バイク.*(やめ|なし|しない)/.test(text)) return { type: "skip_cardio" };
  if (/(ない|無い|使えない|空いてない|空いていない|混んで|故障|使用中)/.test(text) && /(マシン|機械|器具|台|ベンチ|ダンベル|ない)/.test(text)) {
    const exerciseId = findExerciseByText(text) ?? guessCurrentExercise(w);
    const eq = EQUIPMENT.find((e) => text.includes(e.name.replace(/マシン$/, "")));
    return { type: "no_machine", exerciseId, equipmentId: eq?.id };
  }
  if (/重量|重さ|kg|キロ/.test(text) && /(上げ|増や|重く|いい|大丈夫|？|\?)/.test(text)) return { type: "weight_question", exerciseId: findExerciseByText(text) ?? guessCurrentExercise(w) };
  if (/(疲れ|だる|筋肉痛|張って|重い|痛)/.test(text)) {
    const regions = REGION_WORDS.filter(([re]) => re.test(text)).map(([, r]) => r);
    return { type: "fatigue", regions };
  }
  if (/(追加|入れて|やりたい|足して)/.test(text)) {
    const ex = findExerciseByText(text);
    if (ex) return { type: "add_exercise", exerciseId: ex };
  }
  if (/(抜いて|外して|削除|なしで|やらない|スキップ)/.test(text)) {
    const ex = findExerciseByText(text);
    if (ex) return { type: "remove_exercise", exerciseId: ex };
  }
  return { type: "unknown" };
}

function guessCurrentExercise(w: Workout | null): string | undefined {
  if (!w) return undefined;
  const focused = w.ui?.focusedExerciseId && w.exercises.find((e) => e.id === w.ui!.focusedExerciseId);
  if (focused) return focused.exerciseId;
  const next = w.exercises.find((e) => e.status !== "skipped" && e.sets.some((s) => !s.completed && !s.excluded));
  return next?.exerciseId;
}

export interface CoachReply {
  message: string;
  patch?: PlanPatch;
  /** 画面遷移の指示 */
  navigate?: string;
}

/** 代替種目の候補（同じ主働筋で、店舗で利用可能なもの） */
function alternatives(exerciseId: string, w: Workout, availableIds: Set<string>): string[] {
  const def = getExercise(exerciseId);
  if (!def) return [];
  return EXERCISES.filter((e) => e.id !== exerciseId && availableIds.has(e.id) && !w.exercises.some((x) => x.exerciseId === e.id) && e.primary.some((m) => def.primary.includes(m)))
    .sort((a, b) => b.priority - a.priority)
    .map((e) => e.id);
}

export function respond(intent: Intent, w: Workout | null, ctx: { history: Workout[]; availableIds: Set<string> }): CoachReply {
  switch (intent.type) {
    case "start_session":
      return { message: "お疲れさまです！今日のコンディションを教えてください。", navigate: "/start" };
    case "unknown":
      return {
        message: "うまく解釈できませんでした。例：「ジムに来た」「今日は脚が疲れている」「あと20分しかない」「レッグプレスのマシンがない」「重量を上げてもいい？」「今日はランニングをやめたい」",
      };
  }
  if (!w) {
    return { message: "進行中のトレーニングがありません。「ジムに来た」または「トレーニング開始」で始めましょう。", navigate: intent.type === "fatigue" ? "/start" : undefined };
  }
  switch (intent.type) {
    case "fatigue": {
      const regions = intent.regions.length ? intent.regions : [];
      const ops: PlanPatch["ops"] = [];
      const names: string[] = [];
      for (const e of w.exercises) {
        const def = getExercise(e.exerciseId);
        if (!def || e.sets.some((s) => s.completed)) continue;
        const hit = regions.length ? def.regions.some((r) => regions.includes(r)) : false;
        if (!hit) continue;
        const cur = e.sets.find((s) => !s.completed)?.weight;
        if (cur !== undefined && def.increment) {
          const nw = Math.max(def.increment, Math.round((cur * 0.85) / def.increment) * def.increment);
          if (nw < cur) ops.push({ op: "set_weight", exerciseId: e.exerciseId, weight: nw, reason: "疲労のため約15%軽く" });
        }
        if (e.sets.filter((s) => !s.excluded).length > 2) ops.push({ op: "set_sets", exerciseId: e.exerciseId, sets: 2, reason: "疲労のため2セットに" });
        names.push(e.name);
      }
      const legs = regions.includes("legs") || regions.includes("glutes");
      if (legs) {
        const tm = w.cardio.find((c) => c.machine === "treadmill" && !c.completed && c.plan.some((s) => s.kind === "run"));
        if (tm) ops.push({ op: "set_cardio", machine: "treadmill", segments: strip(buildTreadmillPlan("walk", Math.round(tm.plan.reduce((a, s) => a + s.durationSec, 0) / 60), undefined, false)), reason: "脚の疲労のためウォーキングに変更" });
      }
      const label = regions.map((r) => REGION_LABEL[r]).join("・") || "全身";
      if (!ops.length) return { message: `了解です。${label}の疲労を考慮します。該当する未実施の種目が無いため、メニューはそのままです。無理のない範囲で、きつければセットを減らしてください。` };
      return { message: `${label}の疲労を考慮して、${names.join("・")}の負荷を下げました${legs ? "。ランニングはウォーキングに変更しています" : ""}。`, patch: { message: "疲労調整", ops } };
    }
    case "time_left": {
      const min = intent.minutes;
      const ops: PlanPatch["ops"] = [];
      let budget = min;
      const remainingCardio = w.cardio.filter((c) => !c.completed && !c.skipped);
      // 残り種目を優先度順に、時間に収まるまで採用
      const pending = w.exercises.filter((e) => e.status !== "skipped" && e.sets.some((s) => !s.completed && !s.excluded));
      const keep: string[] = [];
      const drop: string[] = [];
      for (const e of pending) {
        const def = getExercise(e.exerciseId);
        const remainingSets = e.sets.filter((s) => !s.completed && !s.excluded).length;
        const need = def ? exerciseMinutes(def, remainingSets) - 0.5 : remainingSets * 1.5;
        if (need <= budget) {
          budget -= need;
          keep.push(e.name);
        } else if (def && remainingSets > 1 && exerciseMinutes(def, 1) <= budget) {
          const done = e.sets.filter((s) => s.completed).length;
          ops.push({ op: "set_sets", exerciseId: e.exerciseId, sets: done + 1, reason: `残り${min}分のため1セットに` });
          budget -= exerciseMinutes(def, 1);
          keep.push(`${e.name}(1セット)`);
        } else {
          ops.push({ op: "remove_exercise", exerciseId: e.exerciseId, reason: `残り${min}分のため省略` });
          drop.push(e.name);
        }
      }
      for (const c of remainingCardio) {
        const planMin = c.plan.reduce((a, s) => a + s.durationSec, 0) / 60;
        if (budget >= 6 && c.machine === "treadmill") {
          const m = Math.min(planMin, Math.floor(budget));
          if (m < planMin) ops.push({ op: "set_cardio", machine: "treadmill", segments: strip(buildTreadmillPlan(c.plan.some((s) => s.kind === "run") ? "run" : "walk", m, { speedKmh: c.plan.find((s) => s.kind === "run")?.speedKmh ?? 12, totalRunMin: Math.max(2, Math.floor(m / 2)), intervalMin: 2, rationale: "短縮" })), reason: `残り時間に合わせて${m}分に短縮` });
          budget -= m;
        } else {
          ops.push({ op: "remove_cardio", machine: c.machine, reason: "時間が足りないため省略" });
        }
      }
      return {
        message: `残り${min}分に合わせました。${keep.length ? `実施：${keep.join("・")}` : ""}${drop.length ? `／省略：${drop.join("・")}` : ""}`,
        patch: { message: `残り${min}分`, ops },
      };
    }
    case "no_machine": {
      const exId = intent.exerciseId;
      if (!exId) return { message: "どの種目のマシンですか？例：「レッグプレスのマシンがない」" };
      const e = w.exercises.find((x) => x.exerciseId === exId);
      const alts = alternatives(exId, w, ctx.availableIds);
      const def = getExercise(exId);
      if (!e) return { message: `${def?.name ?? exId} は今日のメニューに入っていません。` };
      if (alts.length) {
        const to = alts[0];
        return {
          message: `${e.name} の代わりに ${getExercise(to)?.name} に置き換えます。設定 → 店舗の器具 で「この器具はない」にすると次回から自動的に除外されます。`,
          patch: { message: "代替種目", ops: [{ op: "replace_exercise", from: exId, to, reason: "器具が無いため代替" }] },
        };
      }
      return { message: `${e.name} をメニューから外します。代替候補が見つかりませんでした。`, patch: { message: "種目を外す", ops: [{ op: "remove_exercise", exerciseId: exId, reason: "器具が無いため" }] } };
    }
    case "weight_question": {
      const exId = intent.exerciseId;
      const e = exId && w.exercises.find((x) => x.exerciseId === exId);
      if (!e) return { message: "どの種目ですか？例：「チェストプレスの重量を上げてもいい？」" };
      const def = getExercise(e.exerciseId)!;
      const hist = exerciseHistory(ctx.history, e.exerciseId, w.storeId);
      const last = hist[0];
      const cur = e.sets.find((s) => !s.completed)?.weight ?? e.sets[e.sets.length - 1]?.weight;
      const doneToday = e.sets.filter((s) => s.completed);
      const todayReported = doneToday.length > 0 && doneToday.every((s) => s.actualReps !== undefined && s.reps !== undefined && s.actualReps >= s.reps);
      const todayEasy = doneToday.some((s) => s.feel === "easy");
      if (cur === undefined) return { message: `${e.name} はまだ基準重量がありません。軽めで確認してから決めましょう。` };
      if (todayReported || todayEasy) {
        const nw = cur + def.increment;
        return { message: `今日の${e.name}は目標回数を達成${todayEasy ? "し「楽」でした" : "しています"}。残りのセットを ${nw}kg に上げて問題ありません（フォームが崩れたら戻してください）。`, patch: { message: "重量アップ", ops: [{ op: "set_weight", exerciseId: e.exerciseId, weight: nw, reason: "目標達成のため" }] } };
      }
      if (last && allTargetsReported(last.exercise)) {
        return { message: `前回（${last.workout.trainingDate}）は全セット目標達成の記録があるので、${cur + def.increment}kg を試してよいでしょう。上げる場合は「${e.name}を${cur + def.increment}kgに」と言ってください。` };
      }
      const lastW = last ? workingWeight(last.exercise) : undefined;
      return {
        message: `${e.name} は現在 ${cur}kg${lastW !== undefined ? `（前回 ${lastW}kg）` : ""}。実回数の記録が無いため、まずは今のセットで目標回数を達成できたか「実回数」に入力してください。全セット達成していれば次のセットから +${def.increment}kg が目安です。`,
      };
    }
    case "stop_running": {
      const tm = w.cardio.find((c) => c.machine === "treadmill" && !c.completed);
      if (!tm) return { message: "今日のトレッドミルの計画はありません。" };
      const total = Math.round(tm.plan.reduce((a, s) => a + s.durationSec, 0) / 60) || 15;
      return { message: `了解です。トレッドミルはウォーキング${total}分に変更しました。`, patch: { message: "ランニング中止", ops: [{ op: "set_cardio", machine: "treadmill", segments: strip(buildTreadmillPlan("walk", total, undefined, true)), reason: "本人希望によりウォーキング" }] } };
    }
    case "skip_cardio": {
      const ops: PlanPatch["ops"] = w.cardio.filter((c) => !c.completed).map((c) => ({ op: "remove_cardio" as const, machine: c.machine, reason: "本人希望" }));
      return { message: ops.length ? "有酸素は今日はやらないことにします。" : "未完了の有酸素はありません。", patch: ops.length ? { message: "有酸素中止", ops } : undefined };
    }
    case "add_exercise": {
      const def = getExercise(intent.exerciseId);
      if (!def) return { message: "その種目はカタログにありません。" };
      if (!ctx.availableIds.has(def.id)) return { message: `${def.name} はこの店舗では器具が無い設定です。設定 → 店舗の器具 から変更できます。` };
      return { message: `${def.name} を追加しました。`, patch: { message: "種目追加", ops: [{ op: "add_exercise", exerciseId: def.id, reason: "本人希望" }] } };
    }
    case "remove_exercise": {
      const def = getExercise(intent.exerciseId);
      if (!def) return { message: "その種目はカタログにありません。" };
      return { message: `${def.name} を外しました。`, patch: { message: "種目削除", ops: [{ op: "remove_exercise", exerciseId: def.id, reason: "本人希望" }] } };
    }
  }
  return { message: "対応できませんでした。" };
}

function strip(segs: CardioSegment[]): Omit<CardioSegment, "id">[] {
  return segs.map((s) => {
    const { id: _id, ...rest } = s;
    void _id;
    return rest;
  });
}
