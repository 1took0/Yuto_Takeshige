import type { BodyRegion, ExerciseDef, FocusArea, Goals, IntakeAnswers, MenuPreferences, MuscleGroup, Settings, StoreEquipment, Workout, WorkoutExercise } from "@/lib/types";
import { EQUIPMENT_STYLE_LABEL, INTENSITY_LABEL, isNovice, prefsOrEmpty } from "@/lib/preferences";
import { goalsOrDefault, strengthFocused, wantsCardio } from "@/lib/goals";
import { allExercises, customExercises, exerciseName, getExercise, isExerciseDeleted } from "@/lib/catalog/exercises";
import { MUSCLE_TO_REGION, REGION_LABEL } from "@/lib/catalog/muscles";
import { storeName, workoutStoreName } from "@/lib/catalog/stores";
import { diffDays, trainingDateOf } from "@/lib/date/trainingDay";
import { newId } from "@/lib/id";
import { buildExercise } from "@/lib/workout/edit";
import { detectComeback, type Comeback } from "./comeback";
import { manualHabits, cardioHabits, skipsCardio } from "./habits";
import { allowedReps, decideNextLoad, estimateStartWeight, progressionProfile, roundToStep, stepFor, toPastSession } from "./progression";
import { bikeWarmup, buildTreadmillPlan, decideTreadmillMode, nextRunTarget, planTotalMin, treadmillEntry } from "./cardio";
import { daysSince, doneInLastN, sortByDateDesc, exerciseHistory, lastTrainedByMuscle, runHistory, toPrevious, usedAtStore, workingSeconds, workingWeight, type ExerciseHistoryEntry } from "./history";

/**
 * ルールベースのメニュー生成
 *
 * 方針
 * - スロット（部位ごとの枠）に候補種目を並べ、店舗の器具・疲労・時間で絞る
 * - 過去の重量は初期値にするが、別店舗の記録は「参考値」として扱い同一負荷とみなさない
 * - 実回数が報告されていなければ目標達成とみなさず、重量は据え置く
 * - 長時間でもセット数は必要以上に増やさない（筋トレと有酸素の両立）
 */

export interface PlanInput {
  intake: IntakeAnswers;
  history: Workout[];
  storeEquipment: StoreEquipment[];
  settings: Pick<Settings, "excludedExerciseIds"> & { goals?: Goals; preferences?: MenuPreferences };
  now?: Date;
}

export interface PlanResult {
  workout: Workout;
  summary: string[];
  warnings: string[];
}

interface Slot {
  key: string;
  candidates: string[];
  regions: BodyRegion[];
  base: number;
  /** 必須に近い（おまかせ/全身で優先的に確保） */
  core?: boolean;
}

const SLOTS: Slot[] = [
  { key: "legs_compound", candidates: ["leg_press", "db_goblet_squat"], regions: ["legs", "glutes"], base: 100, core: true },
  { key: "hamstrings", candidates: ["leg_curl", "db_rdl"], regions: ["legs"], base: 92, core: true },
  { key: "glutes", candidates: ["abductor", "hip_thrust", "db_lunge"], regions: ["glutes"], base: 90, core: true },
  { key: "chest_press", candidates: ["chest_press", "db_bench_press"], regions: ["chest"], base: 98, core: true },
  { key: "back_vertical", candidates: ["lat_pulldown", "assisted_chin", "pulldown_trainer"], regions: ["back"], base: 98, core: true },
  { key: "back_horizontal", candidates: ["seated_row", "plate_row", "db_row"], regions: ["back"], base: 95, core: true },
  { key: "abs", candidates: ["abdominal"], regions: ["abs"], base: 93, core: true },
  { key: "chest_iso", candidates: ["pec_fly", "db_fly"], regions: ["chest"], base: 80 },
  { key: "biceps_hammer", candidates: ["db_hammer_curl_single"], regions: ["arms"], base: 82 },
  { key: "triceps", candidates: ["triceps", "db_kickback"], regions: ["arms"], base: 80 },
  { key: "biceps", candidates: ["biceps_curl", "db_curl_single"], regions: ["arms"], base: 78 },
  { key: "core", candidates: ["side_plank", "plank"], regions: ["abs"], base: 76 },
  { key: "shoulders", candidates: ["shoulder_press", "db_shoulder_press", "db_lateral_raise"], regions: ["shoulders"], base: 70 },
  { key: "quads_iso", candidates: ["leg_extension"], regions: ["legs"], base: 66 },
  { key: "abs_2", candidates: ["knee_leg_raise"], regions: ["abs"], base: 64 },
  { key: "hip_thrust_extra", candidates: ["hip_thrust"], regions: ["glutes"], base: 62 },
  { key: "adductors", candidates: ["adductor"], regions: ["legs"], base: 55 },
  { key: "lower_back", candidates: ["back_extension"], regions: ["lower_back", "glutes"], base: 50 },
  { key: "calves", candidates: ["calf_raise"], regions: ["legs"], base: 30 },
];

const FOCUS_REGIONS: Record<FocusArea, BodyRegion[] | null> = {
  auto: null,
  full: null,
  lower: ["legs", "glutes"],
  chest_back: ["chest", "back"],
  arms_shoulders: ["arms", "shoulders"],
  abs_core: ["abs", "lower_back"],
};

interface Budget {
  totalMin: number;
  warmupMin: number;
  cardioMin: number;
  strengthMin: number;
  unlimited: boolean;
}

export function computeBudget(intake: IntakeAnswers, cardioMode: "walk" | "run", cardioEmphasis = true): Budget {
  const noCardio = intake.cardio === "none";
  const unlimited = intake.timeLimitMin === null;
  const T = intake.timeLimitMin ?? 120;
  let warmup = T >= 60 ? 6 : T >= 45 ? 5 : 3;
  let cardio = cardioMode === "run" ? Math.min(25, Math.round(T * 0.28)) : Math.min(20, Math.max(8, Math.round(T * 0.2)));
  if (T <= 30) {
    warmup = 3;
    cardio = cardioMode === "run" ? 8 : 6;
  }
  // 体脂肪減少・ランニングを目標にしていない場合は有酸素を控えめに
  if (!cardioEmphasis) cardio = Math.max(5, Math.round(cardio * 0.7));
  if (intake.condition <= 2) cardio = Math.min(cardio, 12);
  // 有酸素なし（本人の希望）なら、その分を筋トレに回す
  if (noCardio) cardio = 0;
  const transitions = T >= 60 ? 4 : 2;
  const strength = Math.max(10, T - warmup - cardio - transitions);
  return { totalMin: T, warmupMin: warmup, cardioMin: cardio, strengthMin: strength, unlimited };
}

export function exerciseMinutes(def: ExerciseDef, sets: number): number {
  const work = def.workSec * (def.unilateral ? 2 : 1);
  return (sets * work + Math.max(0, sets - 1) * def.restSec + 60) / 60;
}

interface Availability {
  ok: boolean;
  confirmed: boolean;
}

function availability(storeEquipment: StoreEquipment[], storeId: string, equipmentId: string): Availability {
  const row = storeEquipment.find((r) => r.storeId === storeId && r.equipmentId === equipmentId);
  // 「その他の器具」は店舗の器具一覧に無いので、使える前提（未確認）で扱う
  if (!row) return equipmentId === "other" ? { ok: true, confirmed: false } : { ok: false, confirmed: false };
  return { ok: row.available, confirmed: row.confirmed };
}

export interface SorenessInfo {
  level: "none" | "light" | "moderate" | "severe";
  regions: Set<BodyRegion>;
}

function sorenessOf(intake: IntakeAnswers): SorenessInfo {
  if (!intake.soreness || !intake.soreRegions.length) return { level: "none", regions: new Set() };
  return { level: intake.soreLevel ?? "light", regions: new Set(intake.soreRegions) };
}

/** 痛みの自由入力から影響部位を推定（除外判定のみに使う） */
export function painRegions(desc: string | undefined): Set<BodyRegion | "knee" | "elbow" | "wrist"> {
  const s = new Set<BodyRegion | "knee" | "elbow" | "wrist">();
  if (!desc) return s;
  if (/腰/.test(desc)) s.add("lower_back");
  if (/膝|ひざ/.test(desc)) s.add("knee");
  if (/肩/.test(desc)) s.add("shoulders");
  if (/肘|ひじ/.test(desc)) s.add("elbow");
  if (/手首/.test(desc)) s.add("wrist");
  if (/胸/.test(desc)) s.add("chest");
  if (/背中/.test(desc)) s.add("back");
  if (/首/.test(desc)) s.add("shoulders");
  if (/太もも|もも|ハム|脚|足|ふくらはぎ|股関節/.test(desc)) s.add("legs");
  if (/お尻|尻|臀/.test(desc)) s.add("glutes");
  if (/腹/.test(desc)) s.add("abs");
  return s;
}

function painExcludes(def: ExerciseDef, pains: ReturnType<typeof painRegions>): string | null {
  if (!pains.size) return null;
  const all: MuscleGroup[] = [...def.primary, ...def.secondary];
  const regions = new Set(all.map((m) => MUSCLE_TO_REGION[m]));
  for (const r of def.regions) regions.add(r);
  if (pains.has("lower_back") && (def.primary.includes("lower_back") || ["leg_press", "back_extension", "hip_thrust", "shoulder_press"].includes(def.id))) return "腰の痛みのため除外";
  if (pains.has("knee") && (def.primary.includes("quads") || def.id === "leg_press" || def.id === "leg_extension")) return "膝の違和感のため除外";
  if (pains.has("elbow") && (def.primary.includes("biceps") || def.primary.includes("triceps"))) return "肘の違和感のため除外";
  if (pains.has("wrist") && ["db_curl_single", "db_hammer_curl_single", "biceps_curl", "triceps", "plank", "side_plank"].includes(def.id)) return "手首の違和感のため除外";
  if (pains.has("shoulders") && (def.primary.includes("shoulders") || def.primary.includes("chest") || def.id === "lat_pulldown")) return "肩の違和感のため除外";
  for (const r of ["chest", "back", "legs", "glutes", "abs"] as BodyRegion[]) {
    if (pains.has(r) && def.regions[0] === r) return `${REGION_LABEL[r]}の痛みのため除外`;
  }
  return null;
}

interface Candidate {
  slot: Slot;
  def: ExerciseDef;
  score: number;
  confirmed: boolean;
  loadFactor: number;
  setsDelta: number;
  notes: string[];
}

export function generatePlan(input: PlanInput): PlanResult {
  const { intake, history, storeEquipment, settings } = input;
  const now = input.now ?? new Date();
  const today = trainingDateOf(now);
  const summary: string[] = [];
  const warnings: string[] = [];
  const store = intake.storeId;
  const sore = sorenessOf(intake);
  const prefs = prefsOrEmpty(settings.preferences);
  // 今日の痛みに加え、普段から気をつけたいケガ・痛み（希望）も毎回考慮する
  const pains = painRegions([intake.pain.present ? intake.pain.description : "", prefs.chronicPain ?? ""].join(" "));
  const disliked = new Set(prefs.dislikedExerciseIds ?? []);
  const lessRegions = new Set(prefs.lessRegions ?? []);
  const novice = isNovice(prefs);
  const focusRegions = FOCUS_REGIONS[intake.focus];
  const lastTrained = lastTrainedByMuscle(history);
  const excluded = new Set(settings.excludedExerciseIds);
  const goals = goalsOrDefault(settings.goals);
  // 久しぶりのトレーニング（前回から2週間以上空いた、またはメモで「久しぶり」など）なら軽めに再開する
  const lastDate = sortByDateDesc(history)[0]?.trainingDate;
  const comeback = detectComeback(lastDate ? diffDays(today, lastDate) : undefined, intake.memo);

  // ---- 有酸素の方針と時間配分 ----
  const noCardio = intake.cardio === "none";
  const tm = noCardio ? { mode: "walk" as const } : decideTreadmillMode(intake);
  const budget = computeBudget(intake, tm.mode, wantsCardio(goals));
  if (tm.reason) warnings.push(tm.reason);
  // これまでの記録でバイクを一度も行っていない人には、ウォームアップのバイクを入れない（その分は筋トレに回す）
  const cardioUse = cardioHabits(history, today);
  const noBike = skipsCardio(cardioUse, "bike");
  if (noBike && budget.warmupMin > 0) {
    budget.strengthMin += budget.warmupMin;
    budget.warmupMin = 0;
  }

  // ---- 候補種目のスコアリング ----
  const candidates: Candidate[] = [];
  const usedExercise = new Set<string>();
  // 自作種目のうち「メニュー自動作成に含める」ものは、それぞれ独立した枠として候補に加える
  const slots: Slot[] = [...SLOTS, ...customExercises().filter((d) => d.autoMenu).map((d) => ({ key: `custom:${d.id}`, candidates: [d.id], regions: d.regions, base: 60 }))];
  // 自分で入力したメニューでよく行う種目は、自動作成の枠に無い種目（自作種目など）でも候補に加える
  const habits = manualHabits(history, today);
  for (const [id, f] of habits.freq) {
    const def = getExercise(id);
    if (!def || f < 1 / 3 || slots.some((sl) => sl.candidates.includes(id))) continue;
    slots.push({ key: `habit:${id}`, candidates: [id], regions: def.regions, base: 62 });
  }
  // ヒアリングで答えた「これまでに行っていた種目」も、自動作成の枠に無ければ候補に加える
  const pastIds = new Set((prefs.pastExercises ?? []).map((x) => x.exerciseId));
  for (const id of pastIds) {
    const def = getExercise(id);
    if (!def || slots.some((sl) => sl.candidates.includes(id))) continue;
    slots.push({ key: `past:${id}`, candidates: [id], regions: def.regions, base: 62 });
  }
  for (const slot of slots) {
    let chosen: Candidate | null = null;
    for (const exId of slot.candidates) {
      const def = getExercise(exId);
      if (!def || excluded.has(exId) || isExerciseDeleted(exId) || usedExercise.has(exId)) continue;
      // やりたくない種目（希望）は自動作成では選ばない（同じ枠の別の種目を使う）
      if (disliked.has(exId)) continue;
      const av = availability(storeEquipment, store, def.equipmentId);
      if (!av.ok) continue;
      // 将来導入候補は、その店舗で利用実績があるときのみ自動提案
      if (def.optional && !pastIds.has(exId) && !usedAtStore(history, exId, store)) continue;
      const painReason = painExcludes(def, pains);
      if (painReason) {
        warnings.push(`${def.name}：${painReason}`);
        continue;
      }
      const notes: string[] = [];
      let score = slot.base + (def.priority - 80) * 0.2;
      let loadFactor = 1;
      let setsDelta = 0;

      // 自分で入力したメニューでよく行う種目は選びやすく、自分のメニューに一度も入れていない種目は少し選びにくく
      const habit = habits.freq.get(exId) ?? 0;
      if (habit > 0) {
        score += 40 * habit;
        notes.push("自分で組んだメニューでよく行っている種目です");
      } else if (habits.count >= 2) score -= 10;
      // ヒアリングで「これまでに行っていた」と答えた種目は選びやすく
      if (pastIds.has(exId)) {
        score += 40;
        notes.push("以前行っていた種目です");
      }

      // 重点部位
      if (focusRegions) {
        const match = slot.regions.some((r) => focusRegions.includes(r));
        score += match ? 40 : -35;
      }
      // 疲労・筋肉痛
      const hit = slot.regions.some((r) => sore.regions.has(r)) || def.primary.some((m) => sore.regions.has(MUSCLE_TO_REGION[m]));
      if (hit && sore.level !== "none") {
        if (sore.level === "severe") {
          warnings.push(`${def.name}：強い筋肉痛のため今日は休ませます`);
          continue;
        }
        if (sore.level === "moderate") {
          score -= 30;
          loadFactor = 0.8;
          setsDelta = -1;
          notes.push("疲労が残っているため負荷を約20%下げ、セット数を減らしています");
        } else {
          score -= 12;
          loadFactor = 0.9;
          notes.push("軽い筋肉痛のため負荷を約10%下げています");
        }
      }
      // 回復日数（直近に鍛えた部位は優先度を下げる）
      const ds = daysSince(lastTrained, def.primary, today);
      if (ds <= 1) score -= 15;
      else if (ds >= 4) score += 8;
      // 目標：特に鍛えたい部位（おまかせ・全身のとき）
      if (!focusRegions && goals.priorityRegions.length && slot.regions.some((r) => goals.priorityRegions.includes(r))) score += 6;
      // 目標：定期的に入れたい種目（直近2回でやっていなければ加点）
      if (goals.favoriteExerciseIds.includes(exId) && !doneInLastN(history, exId, 2)) score += 30;
      // 目標：握力・前腕 → ハンマーカール、腰痛対策 → 体幹・腰
      if (goals.objectives.includes("grip") && exId === "db_hammer_curl_single") score += 5;
      if (goals.objectives.includes("lowback") && (slot.key === "core" || slot.key === "lower_back")) score += 8;
      // 目標：ダンベル優先
      if (goals.preferDumbbell && def.equipmentId === "dumbbells") score += 25;
      // 希望：マシン中心
      if (!goals.preferDumbbell && prefs.equipmentStyle === "machine" && def.equipmentId === "dumbbells") score -= 15;
      // 希望：控えたい部位（その日に重点として選んだ場合を除く）
      if (lessRegions.size && slot.regions.some((r) => lessRegions.has(r)) && !(focusRegions && slot.regions.some((r) => focusRegions.includes(r)))) {
        score -= 30;
        setsDelta -= 1;
        notes.push("控えめにしたい部位のため少なめに");
      }
      // 経験が浅い人は動きが安定するマシンを優先し、セット数を抑える
      if (novice) {
        if (def.equipmentId === "dumbbells" && !goals.preferDumbbell) score -= 10;
        setsDelta -= 1;
      }
      // 希望：強度
      if (prefs.intensity === "light") setsDelta -= 1;
      if (prefs.intensity === "hard" && slot.core) setsDelta += 1;
      // 器具未確認の店舗は少し下げる
      if (!av.confirmed) {
        score -= 5;
        notes.push("この店舗での器具の有無は未確認です。無ければ設定から除外できます");
      }
      // 久しぶり
      if (comeback) {
        loadFactor *= comeback.loadFactor;
        setsDelta += comeback.setsDelta;
      }
      // 体調
      if (intake.condition <= 2) {
        loadFactor *= 0.9;
        setsDelta -= 1;
      }
      const c: Candidate = { slot, def, score, confirmed: av.confirmed, loadFactor, setsDelta, notes };
      if (!chosen || c.score > chosen.score) chosen = c;
    }
    if (chosen) {
      candidates.push(chosen);
      usedExercise.add(chosen.def.id);
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // ---- 時間予算に収まるように採用 ----
  let remaining = budget.strengthMin;
  let maxExercises = budget.unlimited ? 12 : budget.totalMin >= 90 ? 12 : budget.totalMin >= 60 ? 9 : budget.totalMin >= 45 ? 7 : 5;
  // はじめての人は種目を絞って、ひとつずつ覚えられるように
  if (prefs.experience === "new") maxExercises = Math.min(maxExercises, 6);
  else if (prefs.experience === "beginner") maxExercises = Math.min(maxExercises, 8);
  const chosen: Candidate[] = [];
  for (const c of candidates) {
    if (chosen.length >= maxExercises) break;
    // 重点部位が指定されていて合致しない種目は、必須枠以外は時間に余裕があるときだけ
    if (focusRegions && !c.slot.regions.some((r) => focusRegions.includes(r)) && remaining < budget.strengthMin * 0.35) continue;
    const sets = Math.max(2, c.def.defaultSets + c.setsDelta);
    const mins = exerciseMinutes(c.def, sets);
    if (mins > remaining) {
      // 2セットなら入るか試す
      const mins2 = exerciseMinutes(c.def, 2);
      if (sets > 2 && mins2 <= remaining) {
        c.setsDelta = 2 - c.def.defaultSets;
        remaining -= mins2;
        chosen.push(c);
      }
      continue;
    }
    remaining -= mins;
    chosen.push(c);
  }
  // 実施順序：自分で入力したメニューの並び順があればそれに合わせ、無い種目は標準の順（脚→胸→背中→腕→腹筋・体幹）
  const order = new Map(slots.map((s, i) => [s.key, i]));
  const posOf = (c: Candidate) => habits.position.get(c.def.id) ?? (order.get(c.slot.key) ?? slots.length) / slots.length;
  if (habits.count > 0) chosen.sort((a, b) => posOf(a) - posOf(b));
  else chosen.sort((a, b) => (order.get(a.slot.key) ?? 99) - (order.get(b.slot.key) ?? 99));

  // ---- 重量・回数の決定 ----
  const exercises: WorkoutExercise[] = chosen.map((c) => buildPlannedExercise(c, history, store, sore, goals, prefs, storeEquipment, comeback));

  // ---- 有酸素 ----
  const cardio = [];
  if (budget.warmupMin > 0) cardio.push(bikeWarmup(budget.warmupMin, intake.condition <= 2));
  const legsLight = sore.level === "light" && (sore.regions.has("legs") || sore.regions.has("glutes"));
  if (noCardio) {
    summary.push("有酸素なし（希望により筋トレ中心）");
  } else if (tm.mode === "run") {
    const target = nextRunTarget(runHistory(history), legsLight, goals.runStartSpeedKmh);
    const plan = buildTreadmillPlan("run", budget.cardioMin, target);
    cardio.push(treadmillEntry("run", plan, target.rationale));
    summary.push(`トレッドミル ${Math.round(planTotalMin(plan))}分（${target.speedKmh}km/h のランニングを含む）`);
  } else {
    const plan = buildTreadmillPlan("walk", budget.cardioMin, undefined, !pains.has("lower_back"));
    cardio.push(treadmillEntry("walk", plan, tm.reason ?? "ウォーキング希望"));
    summary.push(`トレッドミル ウォーキング ${Math.round(planTotalMin(plan))}分`);
  }

  const strengthMin = exercises.reduce((a, e) => a + exerciseMinutes(getExercise(e.exerciseId)!, e.sets.length), 0);
  summary.unshift(`${storeName(store, true)}・${budget.unlimited ? "時間制限なし" : `${budget.totalMin}分`}：筋トレ${exercises.length}種目（約${Math.round(strengthMin)}分）${budget.warmupMin ? `＋バイク${budget.warmupMin}分` : ""}`);
  if (noBike) summary.push("これまでの記録にバイクが無いため、ウォームアップのバイクは入れていません");
  if (comeback) summary.push(comeback.label);
  if (habits.count > 0) summary.push(`自分で組んだメニュー（直近${habits.count}回）の種目・順番を参考にしました`);
  if (sore.level !== "none") summary.push(`疲労部位（${[...sore.regions].map((r) => REGION_LABEL[r]).join("・")}）は負荷を調整`);
  const wishes = preferenceSummary(prefs, goals);
  if (wishes.length) summary.push(`希望を反映：${wishes.join("・")}`);

  const workout: Workout = {
    id: newId("w"),
    trainingDate: today,
    startedAt: now.toISOString(),
    storeId: store,
    storeLabel: storeName(store),
    intake,
    exercises,
    cardio,
    status: "active",
    source: "app",
    ui: { focusedExerciseId: null },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return { workout, summary, warnings };
}

/** メニューに反映している希望の要約（表示用） */
export function preferenceSummary(prefs: MenuPreferences, goals: Goals): string[] {
  const out: string[] = [];
  if (prefs.intensity && prefs.intensity !== "normal") out.push(INTENSITY_LABEL[prefs.intensity]);
  if (goals.preferDumbbell) out.push(EQUIPMENT_STYLE_LABEL.dumbbell);
  else if (prefs.equipmentStyle === "machine") out.push(EQUIPMENT_STYLE_LABEL.machine);
  if (goals.priorityRegions.length) out.push(`多め：${goals.priorityRegions.map((r) => REGION_LABEL[r]).join("・")}`);
  if (prefs.lessRegions?.length) out.push(`控えめ：${prefs.lessRegions.map((r) => REGION_LABEL[r]).join("・")}`);
  if (prefs.dislikedExerciseIds?.length) out.push(`除外：${prefs.dislikedExerciseIds.map(exerciseName).join("・")}`);
  return out;
}

export function buildPlannedExercise(
  c: Candidate,
  history: Workout[],
  store: IntakeAnswers["storeId"],
  sore: SorenessInfo,
  goals: Goals = goalsOrDefault(undefined),
  prefs: MenuPreferences = {},
  storeEquipment: StoreEquipment[] = [],
  comeback: Comeback | null = null,
): WorkoutExercise {
  const def = c.def;
  const sets = Math.max(2, def.defaultSets + c.setsDelta);
  const step = stepFor(def, store, storeEquipment);
  const same = exerciseHistory(history, def.id, store);
  const any = exerciseHistory(history, def.id);
  const ref: ExerciseHistoryEntry | undefined = same[0] ?? any[0];
  const isOtherStore = !same[0] && !!any[0];
  const notes = [...c.notes];
  const profile = progressionProfile(def, prefs, goals);
  const [lo] = profile.repRange;
  let weight: number | undefined;
  let reps: number | undefined;
  let seconds: number | undefined;
  let weightReference: WorkoutExercise["weightReference"] = "none";
  // ヒアリングで答えた、以前行っていたときの重量・回数（アプリの記録が無いときの参考）
  const pastEntry = prefs.pastExercises?.find((x) => x.exerciseId === def.id);

  if (def.loadType === "time") {
    seconds = ref ? workingSeconds(ref.exercise) ?? def.defaultSeconds : def.defaultSeconds;
    if (ref && seconds && allSecondsHeld(ref)) {
      notes.push(`前回${seconds}秒を保持できていれば +10秒に挑戦`);
    }
  } else if (def.loadType === "reps") {
    // 自重の回数種目：全セット達成したら回数を+1（20回まで）
    const last = same[0] ? toPastSession(same[0].exercise) : undefined;
    reps = last?.reps ?? (!any[0] ? pastEntry?.reps : undefined) ?? def.defaultReps;
    if (last?.outcome.success && reps !== undefined && reps < 20) {
      reps += 1;
      notes.push("前回は全セット達成 → 回数を+1");
    } else if (last && !last.outcome.success) notes.push("前回は全セット達成していないため回数は据え置き");
  } else if (same[0] && workingWeight(same[0].exercise) !== undefined) {
    // 同じ店舗の記録から、体格・経験・種目に合わせたペースで進める
    weightReference = "same_store";
    const past = same.map((h) => toPastSession(h.exercise));
    const next = decideNextLoad(def, past, step, profile);
    if (comeback && (next.kind === "increase_weight" || next.kind === "increase_reps")) {
      // 久しぶりの日は上げない。前回の重量・回数を基準に下げて再開する
      weight = past[0].weight;
      reps = past[0].reps;
      notes.push("久しぶりのため、前回の重量から下げて再開します（今回は重量・回数を上げません）");
    } else {
      weight = next.weight;
      reps = next.reps;
      notes.push(...next.notes);
      if (comeback) notes.push("久しぶりのため、いつもより軽めにしています");
    }
  } else if (isOtherStore && ref && workingWeight(ref.exercise) !== undefined) {
    // 別店舗の記録は参考値：同じ重量とは限らないので1段階軽めから
    weightReference = "other_store";
    const base = workingWeight(ref.exercise)!;
    weight = def.loadType === "assist" ? roundToStep(base + step, step) : Math.max(step, roundToStep(base - step, step));
    reps = toPastSession(ref.exercise).reps;
    notes.push(`${workoutStoreName(ref.workout, true)}の記録を参考（別店舗・別マシンのため同一負荷とは限らず、1段階軽めから）`);
  } else if (pastEntry?.weight !== undefined && pastEntry.weight > 0) {
    // アプリでは初めてだが以前行っていた種目：その重量を参考に少し軽めから
    const base = pastEntry.weight;
    weight = def.loadType === "assist" ? roundToStep(base * 1.1, step) : Math.max(step, roundToStep(base * 0.9, step));
    reps = pastEntry.reps;
    notes.push(`以前行っていた重量（${base}kg${pastEntry.reps ? `×${pastEntry.reps}回` : ""}）を参考に少し軽めから`);
  } else {
    // 初めての種目：体重が分かれば目安の重量を出す
    const est = estimateStartWeight(def, prefs, step);
    if (est !== undefined) {
      weight = est;
      notes.push(`体重${prefs.bodyWeightKg}kg・経験から見た目安の重量です。最初のセットで余裕を確認し、軽すぎれば上げてください`);
    } else {
      notes.push(isNovice(prefs) ? "初回のため、フォームを優先して余裕を持って10回以上できる重量から始めましょう" : "初回のため軽めの重量で確認してから調整してください");
    }
  }
  if (weight !== undefined) weight = roundToStep(weight * c.loadFactor, step);

  // 片手種目は左右差を考慮（弱い側に合わせる）
  if (def.unilateral && def.loadType === "weight") {
    if (goals.weakSide === "none") notes.push("左右同じ重量・回数で行う");
    else {
      const weak = goals.weakSide === "left" ? "左" : "右";
      const strong = goals.weakSide === "left" ? "右" : "左";
      notes.push(`弱い${weak}から始め、${strong}は${weak}と同じ重量・回数で揃える`);
    }
  }
  // 回数：記録が無いときは目的に合わせた回数から
  if (def.loadType === "weight" || def.loadType === "assist") {
    if (reps === undefined) {
      if (strengthFocused(goals) && def.defaultReps && def.priority >= 95) {
        reps = 8;
        notes.push("筋力向上重視のため8回前後の重量で");
      } else if (prefs.intensity === "light" && def.defaultReps) {
        reps = def.defaultReps + 2;
        notes.push("軽めの希望のため、重量は控えめに回数を多めに");
      }
    } else {
      reps = Math.min(allowedReps(profile)[1], Math.max(lo, reps));
      if (strengthFocused(goals) && def.priority >= 95 && reps <= 8) notes.push("筋力向上重視のため8回前後の重量で");
    }
  }
  if (prefs.intensity === "hard" && def.loadType === "weight") notes.push("最終セットは限界近くまで");

  const ex = buildExercise(def, {
    sets,
    reps,
    weight,
    seconds,
    step,
    recordPlan: true,
    weightReference,
    rampFirst: weight !== undefined && weight >= 20 && def.loadType === "weight",
    rationale: notes.join("。"),
  });
  if (ref) ex.previous = toPrevious(ref);
  // 強い疲労のときはここに来ないが、中程度なら1セット目をさらに軽く
  if (sore.level === "moderate" && ex.sets[0]?.weight !== undefined) {
    ex.sets[0] = { ...ex.sets[0], weight: Math.max(step, ex.sets[0].weight! - step) };
  }
  return ex;
}

function allSecondsHeld(ref: ExerciseHistoryEntry): boolean {
  const sets = ref.exercise.sets.filter((s) => s.completed && !s.excluded);
  return sets.length > 0 && sets.every((s) => typeof s.actualSeconds === "number" && typeof s.seconds === "number" && s.actualSeconds >= s.seconds);
}

/** 利用可能な種目一覧（UIの「種目を追加」用） */
export function availableExercises(storeEquipment: StoreEquipment[], storeId: IntakeAnswers["storeId"], excludedIds: string[] = []): { def: ExerciseDef; confirmed: boolean }[] {
  const ex = new Set(excludedIds);
  return allExercises().filter((d) => !ex.has(d.id))
    .map((def) => ({ def, av: availability(storeEquipment, storeId, def.equipmentId) }))
    .filter((x) => x.av.ok)
    .map((x) => ({ def: x.def, confirmed: x.av.confirmed }));
}

/**
 * 1種目だけ、記録と重量の進め方から重量・回数を決める（トレーニング中に自分で種目を追加したとき）
 * 自分で入力するメニューでは、決めた回数を目標として扱う（後から変えた回数も目標のまま）
 */
export function planSingleExercise(
  exerciseId: string,
  input: { history: Workout[]; storeId: IntakeAnswers["storeId"]; storeEquipment: StoreEquipment[]; settings: { goals?: Goals; preferences?: MenuPreferences }; manual?: boolean },
): WorkoutExercise | null {
  const def = getExercise(exerciseId);
  if (!def) return null;
  const c: Candidate = { slot: { key: "added", candidates: [def.id], regions: def.regions, base: 0 }, def, score: 0, confirmed: true, loadFactor: 1, setsDelta: 0, notes: [] };
  const ex = buildPlannedExercise(c, input.history, input.storeId, { level: "none", regions: new Set() }, goalsOrDefault(input.settings.goals), prefsOrEmpty(input.settings.preferences), input.storeEquipment);
  if (input.manual) ex.sets = ex.sets.map(({ plannedReps: _p, ...s }) => (void _p, s));
  return ex;
}
