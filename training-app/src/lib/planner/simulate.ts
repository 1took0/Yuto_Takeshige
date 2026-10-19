import type { ExerciseDef, MenuPreferences } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { decideNextLoad, estimateStartWeight, progressionProfile, roundToStep, type NextKind, type PastSession } from "./progression";

/**
 * 重量の進め方のシミュレーション（テストと検証用）
 *
 * 人物像（経験・性別・体重・年齢・きつさの好み）ごとに「本当の筋力」を仮定し、
 * アプリが出す重量・回数で毎回トレーニングした結果を記録して、次の回の重量を決める、を繰り返す。
 * - 本当の筋力は回数を重ねるほど伸びるが、伸びは経験が長いほど小さく、上限に近づくほど鈍る
 * - その日の調子のばらつき（±4%）、セットを重ねるごとの疲労（1セットごとに約1回減る）を入れる
 * - 一定の確率で予定のセットを全部終えずに帰る日がある
 */

export interface Persona {
  experience: NonNullable<MenuPreferences["experience"]>;
  sex: NonNullable<MenuPreferences["sex"]>;
  bodyWeightKg: number;
  age: number;
  intensity: NonNullable<MenuPreferences["intensity"]>;
}

export interface SimSession {
  index: number;
  weight: number;
  reps: number;
  kind: NextKind;
  /** その日の本当の1RM */
  oneRm: number;
  /** その重量で1セット目にできた回数 */
  capableReps: number;
  allDone: boolean;
  success: boolean;
  missed: boolean;
}

export interface SimResult {
  persona: Persona;
  exerciseId: string;
  step: number;
  repRange: [number, number];
  sessions: SimSession[];
}

/** 再現できる疑似乱数 */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const GROWTH: Record<Persona["experience"], number> = { new: 0.03, beginner: 0.018, intermediate: 0.006, advanced: 0.0025 };
const CEILING: Record<Persona["experience"], number> = { new: 2.2, beginner: 1.8, intermediate: 1.3, advanced: 1.12 };

/** 1RM とその重量でできる回数（Epley 式の逆算） */
export function repsAt(oneRm: number, weight: number): number {
  if (weight <= 0) return 99;
  return Math.max(0, 30 * (oneRm / weight - 1));
}

export function simulate(persona: Persona, exerciseId: string, opts: { sessions?: number; step?: number; sets?: number; skipRate?: number; seed?: number; startWeight?: number } = {}): SimResult {
  const def = getExercise(exerciseId) as ExerciseDef;
  const prefs: MenuPreferences = { experience: persona.experience, sex: persona.sex, bodyWeightKg: persona.bodyWeightKg, age: persona.age, intensity: persona.intensity };
  const step = opts.step ?? def.increment;
  const sets = opts.sets ?? 3;
  const n = opts.sessions ?? 24;
  const skipRate = opts.skipRate ?? 0.05;
  const rand = rng(opts.seed ?? 12345);
  const profile = progressionProfile(def, prefs);
  const [lo] = profile.repRange;

  // 本当の筋力：アプリの目安より少し強い〜弱い人がいるように、目安の 0.8〜1.3 倍の重量で 12 回できる人とする
  const est = estimateStartWeight(def, prefs, step) ?? step * 4;
  const twelveRm = est * (0.8 + rand() * 0.5);
  let oneRm = twelveRm * (1 + 12 / 30);
  const ceiling = oneRm * CEILING[persona.experience];
  const growth = GROWTH[persona.experience] * (persona.age >= 50 ? 0.6 : 1);

  const history: PastSession[] = [];
  const out: SimSession[] = [];
  for (let i = 0; i < n; i++) {
    const next = decideNextLoad(def, history, step, profile);
    let weight: number;
    let reps: number;
    if (next.kind === "start") {
      weight = opts.startWeight ?? est;
      reps = def.defaultReps ?? lo;
    } else {
      weight = next.weight!;
      reps = next.reps!;
    }
    weight = roundToStep(weight, step);
    const today = oneRm * (0.96 + rand() * 0.08);
    const capable = repsAt(today, weight);
    // セットごとに約1回ずつ減る
    const perSet = Array.from({ length: sets }, (_, k) => Math.floor(capable - k));
    const leaveEarly = rand() < skipRate;
    const doneSets = leaveEarly ? Math.max(1, sets - 1) : sets;
    const actuals = perSet.slice(0, doneSets).map((r) => Math.max(0, Math.min(reps, r)));
    const missed = actuals.some((a) => a < reps);
    const allDone = doneSets === sets;
    const success = allDone && !missed;
    history.unshift({ weight, reps, outcome: { allDone, success, missed, unreported: false } });
    out.push({ index: i, weight, reps, kind: next.kind, oneRm: today, capableReps: capable, allDone, success, missed });
    // トレーニングで筋力が伸びる（上限に近いほど鈍い）。目標に届かなかった日も少しは伸びる
    oneRm = oneRm * (1 + growth * Math.max(0, 1 - oneRm / ceiling) * (success ? 1 : 0.6));
  }
  return { persona, exerciseId, step, repRange: profile.repRange, sessions: out };
}

/** 予定の負荷（重量×回数）を推定1RMに換算した値 */
export const plannedE1rm = (s: { weight: number; reps: number }) => s.weight * (1 + s.reps / 30);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** 結果の要約 */
export function summarize(r: SimResult) {
  const s = r.sessions;
  const early = s.slice(3, 9);
  const late = s.slice(-6);
  return {
    /** 予定の負荷の伸び（序盤 → 終盤）。1回目は目安の重量なので除く */
    planGrow: avg(late.map(plannedE1rm)) / avg(early.map(plannedE1rm)) - 1,
    /** 本当の筋力の伸び（同じ期間） */
    trueGrow: avg(late.map((x) => x.oneRm)) / avg(early.map((x) => x.oneRm)) - 1,
    /** 終盤の予定の負荷が本当の筋力の何割か（低すぎれば軽すぎ、1を超えれば重すぎ） */
    loadRatio: avg(late.map(plannedE1rm)) / avg(late.map((x) => x.oneRm)),
    missRate: s.filter((x) => x.missed).length / s.length,
    deloads: s.filter((x) => x.kind === "deload").length,
    weightIncreases: s.filter((x) => x.kind === "increase_weight").length,
    repIncreases: s.filter((x) => x.kind === "increase_reps").length,
  };
}

export const PERSONAS: Persona[] = (() => {
  const out: Persona[] = [];
  for (const experience of ["new", "beginner", "intermediate", "advanced"] as const)
    for (const sex of ["male", "female"] as const)
      for (const bodyWeightKg of [50, 70, 95])
        for (const age of [25, 60])
          for (const intensity of ["light", "normal", "hard"] as const) out.push({ experience, sex, bodyWeightKg, age, intensity });
  return out;
})();

/** 代表的な種目（下半身・上半身の複合、単関節の小さい重量、片手ダンベル、腹筋マシン） */
export const SIM_EXERCISES = ["leg_press", "chest_press", "lat_pulldown", "db_lateral_raise", "db_curl_single", "leg_curl", "abdominal"];
