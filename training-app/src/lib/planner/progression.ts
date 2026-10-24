import type { AiProgressionPolicy, ExerciseDef, Goals, MenuPreferences, StoreEquipment, StoreId, WorkoutExercise } from "@/lib/types";
import { strengthFocused } from "@/lib/goals";
import { sessionOutcome, workingWeight, type SessionOutcome } from "./history";

/**
 * 重量・回数の進め方（漸進性過負荷）
 *
 * 方針
 * - 予定したセットをすべて目標回数で終えたときだけ前に進める（途中でやめた・届かなかったときは据え置き）
 * - 初心者は「達成したら次回は重量を1段階上げる」。中級者以上・軽め希望は「回数を上限まで増やしてから重量を上げ、回数を戻す」
 * - 重量の刻みが今の重量に対して大きすぎる（例：4kg のサイドレイズで +2kg = +50%）ときは、まず回数を増やす
 * - 上級者・50歳以上・軽め希望は、続けて達成してから上げる
 * - 2回続けて目標に届かなければ約10%下げてやり直す
 * - 刻みは店舗・器具ごとに設定でき、重量は必ず刻みの倍数にそろえる
 */

export type LiftClass = "lower_compound" | "upper_compound" | "isolation" | "core";

const CLASS_OF: Record<string, LiftClass> = {
  leg_press: "lower_compound",
  hip_thrust: "lower_compound",
  db_goblet_squat: "lower_compound",
  db_lunge: "lower_compound",
  db_rdl: "lower_compound",
  chest_press: "upper_compound",
  lat_pulldown: "upper_compound",
  seated_row: "upper_compound",
  assisted_chin: "upper_compound",
  plate_row: "upper_compound",
  pulldown_trainer: "upper_compound",
  shoulder_press: "upper_compound",
  db_bench_press: "upper_compound",
  db_row: "upper_compound",
  db_shoulder_press: "upper_compound",
  abdominal: "core",
  knee_leg_raise: "core",
  plank: "core",
  side_plank: "core",
  pallof_press: "core",
};

export function liftClass(def: ExerciseDef): LiftClass {
  if (CLASS_OF[def.id]) return CLASS_OF[def.id];
  const p = def.primary;
  if (p.some((m) => m === "abs" || m === "core" || m === "obliques")) return "core";
  const lower = p.some((m) => m === "quads" || m === "glutes" || m === "hamstrings");
  const upper = p.some((m) => m === "chest" || m === "back" || m === "lats" || m === "shoulders");
  // 主働筋が複数あり、補助筋もある種目は複合種目とみなす
  if ((lower || upper) && def.primary.length + def.secondary.length >= 2) return lower ? "lower_compound" : "upper_compound";
  return "isolation";
}

export const CLASS_LABEL: Record<LiftClass, string> = {
  lower_compound: "下半身の複合種目",
  upper_compound: "上半身の複合種目",
  isolation: "単関節種目",
  core: "体幹",
};

export interface ProgressionProfile {
  /** 自動の重量・回数増加を止める。未達成時の負荷軽減は続ける。 */
  hold?: boolean;
  /** 目標回数の範囲 */
  repRange: [number, number];
  /** 1回で上げてよい重量の割合（これを超える刻みなら先に回数を増やす） */
  maxJump: number;
  /** 何回続けて達成したら上げるか */
  requiredSuccesses: number;
  /** 回数を上限まで増やしてから重量を上げる */
  doubleProgression: boolean;
  /** 何回続けて届かなければ下げるか */
  deloadAfter: number;
  deloadPct: number;
  /** 検証済みの相談設定。重量・補助種目だけに適用する。 */
  policy?: AiProgressionPolicy;
  /** 固定回数も重量を上げる明示的な希望があるときだけ使う。 */
  fixedReps?: number;
}

/** 古いバックアップ等で検証を経ず保存された設定から、不正な条件を使わない。 */
export function validatedProgressionPolicy(value: unknown): AiProgressionPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const p = value as Record<string, unknown>;
  const keys = ["requiredSuccesses", "minSessionsAtWeight", "maxIncreasePercent", "strategy", "repRange"];
  if (!Object.keys(p).length || Object.keys(p).some((key) => !keys.includes(key))) return undefined;
  const integerIn = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
  if (p.requiredSuccesses !== undefined && !integerIn(p.requiredSuccesses, 1, 5)) return undefined;
  if (p.minSessionsAtWeight !== undefined && !integerIn(p.minSessionsAtWeight, 1, 8)) return undefined;
  if (p.maxIncreasePercent !== undefined && (typeof p.maxIncreasePercent !== "number" || !Number.isFinite(p.maxIncreasePercent)
    || p.maxIncreasePercent < 1 || p.maxIncreasePercent > 20)) return undefined;
  if (p.strategy !== undefined && p.strategy !== "reps_first" && p.strategy !== "weight_first") return undefined;
  if (p.repRange !== undefined) {
    if (!p.repRange || typeof p.repRange !== "object" || Array.isArray(p.repRange)) return undefined;
    const range = p.repRange as Record<string, unknown>;
    if (Object.keys(range).some((key) => key !== "min" && key !== "max")
      || !integerIn(range.min, 1, 20) || !integerIn(range.max, 1, 20) || (range.min as number) > (range.max as number)) return undefined;
  }
  if (!keys.some((key) => p[key] !== undefined)) return undefined;
  return value as AiProgressionPolicy;
}

const MAX_JUMP: Record<NonNullable<MenuPreferences["experience"]>, Record<LiftClass, number>> = {
  new: { lower_compound: 0.125, upper_compound: 0.1, isolation: 0.1, core: 0.15 },
  beginner: { lower_compound: 0.125, upper_compound: 0.1, isolation: 0.1, core: 0.15 },
  intermediate: { lower_compound: 0.075, upper_compound: 0.06, isolation: 0.06, core: 0.1 },
  advanced: { lower_compound: 0.05, upper_compound: 0.04, isolation: 0.04, core: 0.08 },
};

export function progressionProfile(def: ExerciseDef, prefs: MenuPreferences = {}, goals?: Goals): ProgressionProfile {
  const cls = liftClass(def);
  const exp = prefs.experience ?? "beginner";
  const compound = cls === "lower_compound" || cls === "upper_compound";
  let repRange: [number, number];
  if (prefs.intensity === "light") repRange = cls === "core" ? [15, 20] : [12, 15];
  else if (goals && strengthFocused(goals) && compound) repRange = [5, 8];
  else if (cls === "core") repRange = [12, 20];
  else if (cls === "isolation") repRange = [10, 15];
  else repRange = [8, 12];
  // 種目の標準回数が範囲外なら、標準を含むように広げる（例：アシストチンニング 8回）
  if (def.defaultReps && !(prefs.intensity === "light") && !(goals && strengthFocused(goals) && compound)) {
    repRange = [Math.min(repRange[0], def.defaultReps), Math.max(repRange[1], def.defaultReps)];
  }
  let maxJump = MAX_JUMP[exp][cls];
  let required = exp === "advanced" ? 2 : 1;
  const age = prefs.age ?? 0;
  if (age >= 50) {
    maxJump *= 0.8;
    required += 1;
  }
  if (prefs.intensity === "light") required += 1;
  if (prefs.progressionMode === "cautious") required = Math.max(2, required);
  const policy = def.loadType === "weight" || def.loadType === "assist" ? validatedProgressionPolicy(prefs.progression) : undefined;
  if (policy?.repRange) repRange = [policy.repRange.min, policy.repRange.max];
  return {
    repRange,
    maxJump,
    requiredSuccesses: Math.max(Math.min(3, required), policy?.requiredSuccesses ?? 1),
    doubleProgression: policy?.strategy ? policy.strategy === "reps_first"
      : exp === "intermediate" || exp === "advanced" || prefs.intensity === "light" || prefs.progressionMode === "cautious",
    deloadAfter: 2,
    deloadPct: 0.1,
    ...(prefs.progressionMode === "hold" ? { hold: true } : {}),
    ...(policy ? { policy } : {}),
  };
}

/** 器具の重量の刻みの初期値（店舗の器具で変更していないとき） */
export const DEFAULT_STEP_KG = 5;

/** 店舗で設定していないときの刻み：重量のある種目は 5kg。自分で作った種目は作るときに決めた刻み */
export function defaultStepOf(def: Pick<ExerciseDef, "custom" | "increment" | "loadType">): number {
  if (def.custom && def.increment > 0) return def.increment;
  if (def.loadType === "weight" || def.loadType === "assist") return DEFAULT_STEP_KG;
  return def.increment > 0 ? def.increment : 1;
}

/** この店舗のこの種目で重量を変えられる刻み(kg) */
export function stepFor(def: ExerciseDef, storeId: StoreId, storeEquipment: StoreEquipment[]): number {
  const row = storeEquipment.find((r) => r.storeId === storeId && r.equipmentId === def.equipmentId);
  const step = row?.stepKg ?? defaultStepOf(def);
  return step > 0 ? step : 1;
}

export function roundToStep(v: number, step: number): number {
  const s = step > 0 ? step : 1;
  return Math.max(s, Math.round(Math.round(v / s) * s * 100) / 100);
}

export function floorToStep(v: number, step: number): number {
  const s = step > 0 ? step : 1;
  return Math.max(s, Math.round(Math.floor(v / s + 1e-9) * s * 100) / 100);
}

/** 1回分の記録の要約 */
export interface PastSession {
  weight?: number;
  /** その回のメニュー作成時の目標回数 */
  reps?: number;
  outcome: SessionOutcome;
  /** この実績重量以上の全セット（左右両側）の実回数の最小値。相談設定時だけ使う。 */
  completedReps?: number;
  /** 全予定セットの plannedReps が同じ値のときだけ、その値を残す。 */
  fixedTargetReps?: number;
}

export function toPastSession(e: WorkoutExercise): PastSession {
  const last = [...e.sets].reverse().find((s) => s.completed && !s.excluded) ?? e.sets[e.sets.length - 1];
  return { weight: workingWeight(e), reps: last?.plannedReps ?? last?.reps, outcome: sessionOutcome(e) };
}

export type NextKind = "start" | "increase_weight" | "increase_reps" | "hold" | "deload";

export interface NextLoad {
  kind: NextKind;
  weight?: number;
  reps?: number;
  notes: string[];
}

/**
 * 次回の重量と回数を決める
 * @param sessions 同じ店舗での記録（新しい順）
 */
export function decideNextLoad(def: ExerciseDef, sessions: PastSession[], step: number, profile: ProgressionProfile): NextLoad {
  const [lo, hi] = profile.repRange;
  // 刻みが大きくて回数で伸ばしている途中は、範囲の上限を少し超えていてよい
  const extendedHi = Math.min(MAX_REPS, hi + EXTRA_REPS);
  const clampReps = (r: number) => Math.min(extendedHi, Math.max(lo, r));
  const last = sessions[0];
  if (!last || last.weight === undefined) return { kind: "start", notes: [] };
  const w0 = last.weight;
  // 相談で回数の下限を変更しても、未報告・据え置きの実績を新しい下限の達成とは扱わない。
  const reps0 = profile.hold ? last.reps ?? def.defaultReps ?? lo
    : profile.policy ? Math.min(hi, last.reps ?? def.defaultReps ?? lo) : clampReps(last.reps ?? def.defaultReps ?? lo);
  const assist = def.loadType === "assist";
  const sameWeight = (s: PastSession) => s.weight === w0;
  const streak = (pred: (s: PastSession) => boolean) => {
    let n = 0;
    for (const s of sessions) {
      if (!sameWeight(s) || !pred(s)) break;
      n++;
    }
    return n;
  };
  const successes = streak((s) => s.outcome.success);
  const misses = streak((s) => s.outcome.missed);

  if (last.outcome.unreported && !last.outcome.missed) {
    return { kind: "hold", weight: w0, reps: Math.min(hi, reps0), notes: ["前回の実回数が未入力のため重量は据え置き（達成していれば次回+）"] };
  }
  if (misses >= profile.deloadAfter) {
    const lowered = assist ? roundToStep(w0 * (1 + profile.deloadPct), step) : Math.min(w0 - step, roundToStep(w0 * (1 - profile.deloadPct), step));
    const w = assist ? Math.max(lowered, w0 + step) : Math.min(w0, Math.max(step, lowered));
    return { kind: "deload", weight: w, reps: reps0, notes: [`${misses}回続けて目標回数に届かなかったため、${assist ? "補助を増やして" : "重量を約10%下げて"}やり直します`] };
  }
  if (last.outcome.missed) {
    return { kind: "hold", weight: w0, reps: reps0, notes: ["前回は目標回数に届かなかったセットがあるため据え置き"] };
  }
  if (!last.outcome.allDone) {
    return { kind: "hold", weight: w0, reps: reps0, notes: ["前回は予定のセットを全部終えていないため据え置き（全部終えたら次回アップ）"] };
  }
  if (profile.hold) {
    return { kind: "hold", weight: w0, reps: last.reps ?? def.defaultReps ?? lo, notes: ["希望により重量・回数の自動増加を止め、実績を据え置きます"] };
  }
  if (successes < profile.requiredSuccesses) {
    return { kind: "hold", weight: w0, reps: reps0, notes: [`あと${profile.requiredSuccesses - successes}回続けて全セット達成できたら重量アップ`] };
  }
  if (profile.policy) return decideConfiguredLoad(def, sessions, step, profile, reps0);
  // ここから前に進める
  if (assist) {
    if (w0 - step <= 0) return { kind: "increase_reps", weight: w0, reps: Math.min(hi, reps0 + 1), notes: ["補助なしに近いため、回数を+1"] };
    return { kind: "increase_weight", weight: w0 - step, reps: reps0, notes: [`前回は全セットで目標回数を達成 → 補助を -${step}kg`] };
  }
  const jump = step / w0;
  const w1 = roundToStep(w0 + step, step);
  // 新しい重量で全セットこなせそうな回数。前回の重量×回数から推定し、セットを重ねる疲れと日による調子の差の分（約2回）を見込んで控えめにする
  const est = repsAtWeightExact(w0, reps0, w1);
  const feasible = Math.floor(est + 1e-9) - SET_FATIGUE_REPS;
  const smallJump = jump <= profile.maxJump;
  // 刻みが大きくて新しい重量では回数の下限に届きそうにないときは、範囲を少し超えても回数で伸ばす
  if (profile.doubleProgression && reps0 < hi) {
    return { kind: "increase_reps", weight: w0, reps: reps0 + 1, notes: [`前回は全セット達成 → 回数を+1（${hi}回までできたら +${step}kg）`] };
  }
  if (jump > profile.maxJump && reps0 < hi) {
    return { kind: "increase_reps", weight: w0, reps: reps0 + 1, notes: [`重量の刻み（${step}kg）が今の重量に対して大きい（+${Math.round(jump * 100)}%）ため、まず回数を+1（${hi}回までできたら +${step}kg）`] };
  }
  if (feasible < lo && reps0 < extendedHi) {
    return {
      kind: "increase_reps",
      weight: w0,
      reps: reps0 + 1,
      notes: [`+${step}kg（${w1}kg）は今の力では${lo}回に届きにくいため、もう少し回数を増やして力をつけてから上げます（${reps0 + 1}回）`],
    };
  }
  // 回数を上限まで伸ばしても、次の重量では明らかにこなせない（刻みが大きすぎる）ときは、上げて失敗するのを繰り返さないよう据え置く。
  // ただし上限の回数を続けて楽にこなせている（力がついてきている）なら、ときどき次の重量に挑戦する
  const topStreak = streak((x) => x.outcome.success && (x.reps ?? 0) >= extendedHi);
  if (feasible < lo - SET_FATIGUE_REPS && topStreak < TOP_STREAK_TO_TRY) {
    return {
      kind: "hold",
      weight: w0,
      reps: reps0,
      notes: [`この器具の刻み（${step}kg）では次の重量（${w1}kg）が重すぎます。より小さく変えられる場合（補助プレートなど）は「フォーム・メモ」で刻みを小さくしてください`],
    };
  }
  // 刻みが小さければ初心者は回数をなるべくそのままに重量を上げる（こなせそうな回数を超えない範囲で）。
  // 回数を伸ばしてきた人・刻みが大きいときは、新しい重量でこなせる回数にする
  const reps = !profile.doubleProgression && smallJump && reps0 <= hi ? Math.max(lo, Math.min(reps0, Math.round(est) - 1)) : Math.min(hi, Math.max(lo, feasible));
  const notes = [`前回は全セットで目標回数を達成 → +${step}kg`];
  if (reps < reps0) notes.push(`重量を上げる分、回数は${reps}回にしてから、また増やしていきます`);
  if (feasible < lo) notes.push(`刻みが大きい（+${Math.round(jump * 100)}%）ので、きつければ途中のセットで回数を減らしてください`);
  return { kind: "increase_weight", weight: w1, reps, notes };
}

/** 共通の未達成・未報告・未完了・停止判定を通過した、相談設定のある重量種目。 */
function decideConfiguredLoad(def: ExerciseDef, sessions: PastSession[], step: number, profile: ProgressionProfile, reps0: number): NextLoad {
  const policy = profile.policy!;
  const [lo, hi] = profile.repRange;
  const w0 = sessions[0].weight!;
  const fixed = profile.fixedReps;
  const hold = (note: string): NextLoad => ({ kind: "hold", weight: w0, reps: fixed ?? reps0, notes: [note] });
  const addReps = (note: string): NextLoad => fixed === undefined && reps0 < hi
    ? { kind: "increase_reps", weight: w0, reps: reps0 + 1, notes: [note] } : hold(note);
  const streak = (pred: (s: PastSession) => boolean) => {
    let count = 0;
    for (const session of sessions) {
      if (session.weight !== w0 || !pred(session)) break;
      count++;
    }
    return count;
  };
  // 滞在回数は成功回数ではない。目標未達でも、全セットと実回数を報告した同重量の回は数える。
  const atWeight = streak((s) => s.outcome.allDone && !s.outcome.unreported);
  const minimum = policy.minSessionsAtWeight ?? 1;
  const increaseWeight = (next: NextLoad): NextLoad => atWeight < minimum
    ? hold(`この重量で全セット・実回数を記録した回があと${minimum - atWeight}回必要なため重量は据え置きます`) : next;

  if (fixed !== undefined) {
    const matched = streak((s) => s.outcome.success && s.fixedTargetReps === fixed);
    if (matched < profile.requiredSuccesses) return hold(`相談で決めた${fixed}回を全セットの予定にして、あと${profile.requiredSuccesses - matched}回続けて実回数を達成してから重量を検討します`);
  } else if (reps0 < lo) {
    return addReps(`新しく決めた下限（${lo}回）を達成済みとはみなさず、前回の目標から回数を+1します`);
  }

  // 1段階の幅そのものを変えない。上限超過を反復成功や回数上限で迂回しない。
  const jump = step / w0;
  if (policy.maxIncreasePercent !== undefined && jump > policy.maxIncreasePercent / 100 + 1e-9) {
    return addReps(`店舗の刻み（${step}kg）は今の重量の${Math.round(jump * 100)}%で、相談した上限${policy.maxIncreasePercent}%を超えるため重量は据え置きます`);
  }
  if (fixed === undefined && profile.doubleProgression && reps0 < hi) {
    return addReps(`前回は全セット達成 → 回数を+1（${hi}回に達してから店舗の刻みで重量を検討）`);
  }
  if (def.loadType === "assist") {
    // 補助量は実負荷ではないので、Epley 式を補助kgへ適用しない。
    if (w0 - step <= 0) return addReps("補助を1段階減らすと0kg以下になるため、補助量は維持します");
    return increaseWeight({ kind: "increase_weight", weight: Math.round((w0 - step) * 100) / 100, reps: fixed ?? reps0,
      notes: [`相談した達成条件を満たしたため、補助を -${step}kg（補助量から実負荷の余裕は推定できないため、最初のセットで確認）`] });
  }
  const w1 = Math.round((w0 + step) * 100) / 100;
  const reported = sessions[0].completedReps;
  const performance = reported ?? reps0;
  const est = repsAtWeightExact(w0, fixed === undefined ? performance : reported ?? 0, w1);
  const feasible = Math.floor(est + 1e-9) - SET_FATIGUE_REPS;
  if (fixed !== undefined) {
    if (reported === undefined || feasible < fixed) return hold(`${fixed}回固定で1段階重くする余裕を実回数から確認できないため据え置きます。回数に余裕があった日は実回数を記録するか、固定回数を外して範囲で進めてください`);
    return increaseWeight({ kind: "increase_weight", weight: w1, reps: fixed, notes: [`${fixed}回の固定目標の連続達成と実回数の余裕を確認 → +${step}kg`] });
  }
  if (jump > profile.maxJump && reps0 < hi) {
    return addReps(`店舗の刻みが経験・年齢に対して大きいため、回数を+1してから重量を検討します`);
  }
  // 設定の回数上限を超えて増やさない。重量を上げるには従来の疲労余裕を含む下限を満たす。
  if (feasible < lo) return addReps(`次の重量（${w1}kg）では疲労の余裕を含め${lo}回を見込みにくいため、重量は据え置きます`);
  const reps = !profile.doubleProgression && jump <= profile.maxJump
    ? Math.max(lo, Math.min(reps0, Math.round(est) - 1)) : Math.min(hi, feasible);
  return increaseWeight({ kind: "increase_weight", weight: w1, reps, notes: [`相談した達成条件を満たし、次の重量の回数も見込めるため +${step}kg`] });
}

/** 刻みが大きすぎても、上限の回数をこの回数続けて達成したら次の重量に挑戦する */
const TOP_STREAK_TO_TRY = 3;
/** 新しい重量で見込む余裕の回数（セットを重ねる疲れ・日による調子の差） */
const SET_FATIGUE_REPS = 2;
/** 刻みが大きいときに、回数の範囲を超えて伸ばしてよい回数 */
const EXTRA_REPS = 5;
const MAX_REPS = 20;

/** 重量 w0 で r0 回できた人が、重量 w1 でできる回数の見込み（Epley 式） */
/** 目標回数として出してよい範囲（刻みが大きいときは上限を少し超えてよい） */
export function allowedReps(profile: ProgressionProfile): [number, number] {
  return [profile.repRange[0], profile.policy ? profile.repRange[1] : Math.min(MAX_REPS, profile.repRange[1] + EXTRA_REPS)];
}

export function repsAtWeight(w0: number, r0: number, w1: number): number {
  return Math.floor(repsAtWeightExact(w0, r0, w1) + 1e-9);
}

function repsAtWeightExact(w0: number, r0: number, w1: number): number {
  const oneRm = w0 * (1 + r0 / 30);
  return 30 * (oneRm / w1 - 1);
}

/** 体重に対する初心者（男性）の目安の重量の比率。ダンベルは片手あたり */
const START_RATIO: Record<string, number> = {
  leg_press: 0.9,
  leg_curl: 0.35,
  leg_extension: 0.4,
  abductor: 0.5,
  adductor: 0.45,
  hip_thrust: 0.6,
  calf_raise: 0.6,
  chest_press: 0.45,
  pec_fly: 0.3,
  lat_pulldown: 0.5,
  seated_row: 0.5,
  plate_row: 0.4,
  pulldown_trainer: 0.25,
  shoulder_press: 0.3,
  abdominal: 0.35,
  biceps_curl: 0.2,
  triceps: 0.25,
  db_curl_single: 0.1,
  db_hammer_curl_single: 0.11,
  face_pull: 0.15,
  db_bench_press: 0.17,
  db_fly: 0.09,
  db_row: 0.2,
  db_shoulder_press: 0.12,
  db_lateral_raise: 0.05,
  db_goblet_squat: 0.2,
  db_lunge: 0.1,
  db_rdl: 0.2,
  db_kickback: 0.06,
  pallof_press: 0.1,
};

const EXP_FACTOR: Record<NonNullable<MenuPreferences["experience"]>, number> = { new: 0.6, beginner: 0.8, intermediate: 1, advanced: 1.25 };

/**
 * 初めての種目の重量の目安（体重が分かるときだけ）
 * マシンの重量表示は機種で大きく違うため、控えめにし、最初のセットで確認してもらう
 */
export function estimateStartWeight(def: ExerciseDef, prefs: MenuPreferences, step: number): number | undefined {
  const bw = prefs.bodyWeightKg;
  const ratio = START_RATIO[def.id];
  if (!bw || !ratio || def.loadType !== "weight") return undefined;
  const cls = liftClass(def);
  const upper = cls === "upper_compound" || (cls === "isolation" && def.primary.some((m) => ["chest", "back", "lats", "shoulders", "biceps", "triceps", "forearms"].includes(m)));
  let f = EXP_FACTOR[prefs.experience ?? "beginner"];
  if (prefs.sex === "female") f *= upper ? 0.55 : 0.7;
  else if (prefs.sex !== "male") f *= 0.8;
  const age = prefs.age ?? 0;
  if (age >= 65) f *= 0.7;
  else if (age >= 50) f *= 0.85;
  if (prefs.intensity === "light") f *= 0.85;
  return floorToStep(bw * ratio * f, step);
}
