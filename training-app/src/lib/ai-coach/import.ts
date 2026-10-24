import { z } from "zod";
import type { AiCoachSnapshot, ExerciseDef, Settings } from "@/lib/types";
import { goalsOrDefault, OBJECTIVE_LABEL } from "@/lib/goals";
import { REGION_LABEL } from "@/lib/catalog/muscles";
import { CARDIO_CHOICE_LABEL, EQUIPMENT_STYLE_LABEL, INTENSITY_LABEL } from "@/lib/preferences";

const ids = z.array(z.string().min(1).max(100)).max(80).refine((a) => new Set(a).size === a.length, "種目IDが重複しています");
const regions = z.array(z.enum(["chest", "back", "legs", "glutes", "shoulders", "arms", "abs", "lower_back"])).max(8)
  .refine((a) => new Set(a).size === a.length, "部位が重複しています");
const rule = z.object({
  exerciseId: z.string().min(1).max(100), sets: z.number().int().min(1).max(6).optional(),
  reps: z.number().int().min(1).max(30).optional(), seconds: z.number().int().min(5).max(180).optional(),
  restSec: z.number().int().min(15).max(300).optional(),
}).strict().refine((r) => Object.keys(r).length > 1, "種目別設定が空です");

export const adjustmentSchema = z.object({
  format: z.literal("training-coach-policy"), version: z.literal(1), summary: z.string().trim().min(1).max(1500),
  preferences: z.object({
    intensity: z.enum(["light", "normal", "hard"]).optional(),
    equipmentStyle: z.enum(["machine", "balanced", "dumbbell"]).optional(),
    timeLimitMin: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120), z.null()]).optional(),
    cardio: z.enum(["none", "walk", "run"]).optional(), warmupBike: z.enum(["yes", "no"]).optional(),
    lessRegions: regions.optional(), dislikedExerciseIds: ids.optional(),
    progressionMode: z.enum(["standard", "cautious", "hold"]).optional(),
    exerciseOrder: ids.optional(), exerciseRules: z.array(rule).max(40)
      .refine((a) => new Set(a.map((r) => r.exerciseId)).size === a.length, "種目別設定が重複しています").optional(),
  }).strict().optional(),
  goals: z.object({
    objectives: z.array(z.enum(["strength", "hypertrophy", "fatloss", "lowback", "grip", "running"])).min(1).max(6)
      .refine((a) => new Set(a).size === a.length, "目標が重複しています").optional(),
    priorityRegions: regions.optional(), favoriteExerciseIds: ids.optional(),
  }).strict().optional(),
}).strict().refine((v) => Object.keys(v.preferences ?? {}).length + Object.keys(v.goals ?? {}).length > 0, "反映する設定がありません");

export type AiAdjustment = z.infer<typeof adjustmentSchema>;
export const PROGRESSION_LABEL = { standard: "標準の進め方", cautious: "慎重に段階的に進める", hold: "自動で負荷・回数を増やさない" } as const;

/** AIの返答はデータのみ。説明付きの単一コードブロック、またはJSON単体を受け付ける。 */
export function parseAiAdjustment(text: string, exercises: readonly ExerciseDef[]): AiAdjustment {
  if (text.length > 40000) throw new Error("返却文が長すぎます。方針のJSONだけを貼り付けてください（40,000文字まで）。");
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  if (blocks.length > 1 || (text.includes("```") && blocks.length !== 1)) throw new Error("JSONのコードブロックを1つだけ貼り付けてください。");
  let raw: unknown;
  try { raw = JSON.parse(blocks.length ? blocks[0][1] : text.trim()); }
  catch { throw new Error("返却形式を読み取れません。AIに training-coach-policy のJSONを出し直してもらってください。"); }
  const result = adjustmentSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`返却形式・値が対応範囲外です（${first.path.join(".") || "全体"}）。相談文の形式・範囲に合わせてAIに修正を依頼してください。`);
  }
  const value = result.data;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const p = value.preferences;
  const references = [...(p?.dislikedExerciseIds ?? []), ...(p?.exerciseOrder ?? []), ...(p?.exerciseRules ?? []).map((r) => r.exerciseId), ...(value.goals?.favoriteExerciseIds ?? [])];
  for (const id of references) if (!byId.has(id)) throw new Error(`種目ID「${id}」は現在の一覧にありません。相談文を作り直して確認してください。`);
  for (const r of p?.exerciseRules ?? []) {
    const def = byId.get(r.exerciseId)!;
    if ((r.reps !== undefined && def.loadType === "time") || (r.seconds !== undefined && def.loadType !== "time")) {
      throw new Error(`${def.name}の回数・秒数の指定が種目の種類と一致しません。`);
    }
  }
  return value;
}

export function policySnapshot(s: Settings): AiCoachSnapshot {
  return { preferences: s.preferences, goals: s.goals, lastTimeLimitMin: s.lastTimeLimitMin, lastCardio: s.lastCardio };
}
export const policyKey = (s: Settings) => JSON.stringify(policySnapshot(s));

export function adjustmentPatch(s: Settings, a: AiAdjustment): AiCoachSnapshot {
  const next = policySnapshot(s);
  if (a.preferences) {
    next.preferences = { ...s.preferences, ...a.preferences };
    if (a.preferences.cardio !== undefined) next.lastCardio = a.preferences.cardio;
    if (a.preferences.timeLimitMin !== undefined) next.lastTimeLimitMin = a.preferences.timeLimitMin;
  }
  if (a.goals || a.preferences?.equipmentStyle !== undefined) {
    next.goals = { ...goalsOrDefault(s.goals), ...a.goals };
    if (a.preferences?.equipmentStyle !== undefined) next.goals.preferDumbbell = a.preferences.equipmentStyle === "dumbbell";
  }
  const avoid = new Set([...(next.preferences?.dislikedExerciseIds ?? []), ...s.excludedExerciseIds]);
  const requested = [...(a.goals?.favoriteExerciseIds ?? []), ...(a.preferences?.exerciseOrder ?? []), ...(a.preferences?.exerciseRules ?? []).map((r) => r.exerciseId)];
  if (requested.some((id) => avoid.has(id))) throw new Error("優先する種目・種目別設定と、現在の除外種目が矛盾しています。AIの返却文または除外設定を確認してください。");
  return next;
}

/** 生のJSONではなく、実際に反映する設定を日本語で比較する。 */
export function describeAdjustment(s: Settings, a: AiAdjustment, exercises: readonly ExerciseDef[]): string[] {
  const next = { ...s, ...adjustmentPatch(s, a) };
  const name = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
  const list = (v?: readonly string[]) => v?.length ? v.join("、") : "なし";
  const format = (key: string, v: unknown): string => {
    if (v === undefined) return "未設定（自動）";
    if (key === "intensity") return INTENSITY_LABEL[v as keyof typeof INTENSITY_LABEL];
    if (key === "equipmentStyle") return EQUIPMENT_STYLE_LABEL[v as keyof typeof EQUIPMENT_STYLE_LABEL];
    if (key === "cardio") return CARDIO_CHOICE_LABEL[v as keyof typeof CARDIO_CHOICE_LABEL];
    if (key === "progressionMode") return PROGRESSION_LABEL[v as keyof typeof PROGRESSION_LABEL];
    if (key === "timeLimitMin") return v === null ? "制限なし" : `${v}分`;
    if (key === "warmupBike") return v === "yes" ? "入れる" : "入れない";
    if (key === "objectives") return list((v as Array<keyof typeof OBJECTIVE_LABEL>).map((x) => OBJECTIVE_LABEL[x]));
    if (key === "lessRegions" || key === "priorityRegions") return list((v as Array<keyof typeof REGION_LABEL>).map((x) => REGION_LABEL[x]));
    if (key === "exerciseRules") return list((v as NonNullable<AiAdjustment["preferences"]>["exerciseRules"])?.map((r) => `${name(r.exerciseId)}：${[r.sets === undefined ? "" : `${r.sets}セット`, r.reps === undefined ? "" : `${r.reps}回`, r.seconds === undefined ? "" : `${r.seconds}秒`, r.restSec === undefined ? "" : `休憩${r.restSec}秒`].filter(Boolean).join("・")}`));
    return list((v as string[]).map(name));
  };
  const labels: Record<string, string> = { intensity: "強度", equipmentStyle: "器具の好み", timeLimitMin: "普段の時間", cardio: "トレッドミル", warmupBike: "バイクのウォームアップ", lessRegions: "控える部位", dislikedExerciseIds: "避ける種目", progressionMode: "重量・回数の進め方", exerciseOrder: "種目の優先順", exerciseRules: "種目別の希望", objectives: "目標", priorityRegions: "重点部位", favoriteExerciseIds: "定期的に入れたい種目" };
  return (["preferences", "goals"] as const).flatMap((section) => Object.keys(a[section] ?? {}).map((key) => {
    const before = (s[section] as Record<string, unknown> | undefined)?.[key];
    const after = (next[section] as Record<string, unknown> | undefined)?.[key];
    return `${labels[key]}：${format(key, before)} → ${format(key, after)}`;
  }));
}

export const RETURN_CONTRACT = [
  "## 中長期の方針をアプリへ戻す形式（会話の最後に使う）",
  "まず私の希望・続けられる頻度・種目の好み・進め方を質問し、会話で合意してください。今日だけのメニューではなく、次回以降にも繰り返し使う作成方針を決めます。私が『アプリに反映する方針を出して』と頼んだら、合意済みの変更だけを単一のjsonコードブロックで返してください。",
  '形式例（値は説明用。本人との合意なしでコピーしない）：{"format":"training-coach-policy","version":1,"summary":"合意した中長期方針の要約","preferences":{"cardio":"none","warmupBike":"no","progressionMode":"cautious"},"goals":{"favoriteExerciseIds":["chest_press"]}}',
  "使えるキーは次だけです。省略したキーは現在の設定を保持。配列を指定するとその項目の一覧を全置換（追加分だけにしない）。[]はその希望を解除。summaryは会話の引継ぎ用の説明であり、文章だけでは設定に反映されません。未対応の希望をsummaryに書くだけで実装済みと説明しないでください。",
  "preferences: intensity=light/normal/hard、equipmentStyle=machine/balanced/dumbbell、timeLimitMin=30/45/60/90/120/null（制限なし）、cardio=none/walk/run（主運動のトレッドミル）、warmupBike=yes/no（バイクのウォームアップ）、lessRegions=部位ID配列、dislikedExerciseIds=避ける種目ID配列。",
  "preferences.progressionMode=standard（既存の達成判定）/cautious（標準以上に慎重に、連続達成を確認）/hold（自動増量・回数増加を止める。未達成・疲労による軽減は継続）。店舗の重量刻み・実績を優先し、固定kgや店舗間換算、無条件の毎週増量は取り込めません。",
  "preferences.exerciseOrder=種目ID配列。採用された筋トレ種目の指定分をこの順で先に並べます（採用を保証する指定ではありません）。preferences.exerciseRules=[{exerciseId,sets?,reps?,seconds?,restSec?}]。整数でsets=1〜6、reps=1〜30、seconds=5〜180（time種目のみ）、restSec=15〜300。repsとsecondsは併用不可。回数は固定の希望値で、既存の回数目標から自動増量は行いません。疲労・時間等でセット数は減る場合があります。",
  "goals: objectives=[strength/hypertrophy/fatloss/lowback/grip/running]（1個以上）、priorityRegions=部位ID配列、favoriteExerciseIds=定期的に入れたい種目ID配列。部位IDはchest/back/legs/glutes/shoulders/arms/abs/lower_back。種目IDは下の登録種目一覧を使い、名前から新しいIDを作らないでください。",
  "提案する種目と除外を矛盾させないでください。負荷kg、健康情報、プロフィール、共有設定、実施記録は返却JSONに含めません。週ごとの分割・周期化、曜日固定、バイクを主運動にする計画、有酸素の細かな区間や配置は現在の自動取り込みの対象外です。これらの希望は質問して対応可能な方針に落とすか、手動調整が必要と説明してください。",
  "当日の痛み・疲労・器具の有無・時間制限は取り込んだ方針より優先します。過去や進行中の記録は変更せず、利用者がアプリで変更内容を確認して保存した後の自動作成に適用します。",
].join("\n");
