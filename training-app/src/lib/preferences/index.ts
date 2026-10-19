import type { BodyRegion, CardioChoice, EquipmentStyle, Experience, Goals, Intensity, MenuPreferences } from "@/lib/types";
import { goalsOrDefault } from "@/lib/goals";
import { exerciseName } from "@/lib/catalog/exercises";
import { REGION_LABEL } from "@/lib/catalog/muscles";

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  new: "はじめて",
  beginner: "半年未満",
  intermediate: "半年〜2年",
  advanced: "2年以上",
};

export const INTENSITY_LABEL: Record<Intensity, string> = {
  light: "軽め・フォーム重視",
  normal: "ふつう",
  hard: "しっかり追い込む",
};

export const EQUIPMENT_STYLE_LABEL: Record<EquipmentStyle, string> = {
  machine: "マシン中心",
  balanced: "どちらでも",
  dumbbell: "ダンベル中心",
};

export const CARDIO_CHOICE_LABEL: Record<CardioChoice, string> = {
  none: "なし",
  walk: "ウォーキング",
  run: "ランニング",
};

export const TIME_OPTIONS: { value: number | null; label: string }[] = [
  { value: 30, label: "30分" },
  { value: 45, label: "45分" },
  { value: 60, label: "60分" },
  { value: 90, label: "90分" },
  { value: 120, label: "120分" },
  { value: null, label: "制限なし" },
];

export function prefsOrEmpty(p: MenuPreferences | undefined): MenuPreferences {
  return p ?? {};
}

/** 初回ヒアリングが必要か（希望が未回答で、まだ一度もトレーニングを保存していない） */
export function needsFirstHearing(p: MenuPreferences | undefined, completedCount: number): boolean {
  return !p?.answeredAt && completedCount === 0;
}

/** はじめて・半年未満 */
export function isNovice(p: MenuPreferences): boolean {
  return p.experience === "new" || p.experience === "beginner";
}

/** 希望をメニュー作成に使う形でまとめた変更操作 */
export type WishOp =
  | { kind: "like_exercise"; exerciseId: string }
  | { kind: "dislike_exercise"; exerciseId: string }
  | { kind: "more_region"; region: BodyRegion }
  | { kind: "less_region"; region: BodyRegion }
  | { kind: "cardio"; value: CardioChoice }
  | { kind: "intensity"; value: Intensity }
  | { kind: "equipment"; value: EquipmentStyle }
  | { kind: "time"; minutes: number | null };

const add = <T>(list: T[] | undefined, v: T) => (list?.includes(v) ? list : [...(list ?? []), v]);
const remove = <T>(list: T[] | undefined, v: T) => (list ?? []).filter((x) => x !== v);

export function describeWishOp(op: WishOp): string {
  switch (op.kind) {
    case "like_exercise":
      return `${exerciseName(op.exerciseId)}を定期的に入れる`;
    case "dislike_exercise":
      return `${exerciseName(op.exerciseId)}は自動作成で選ばない`;
    case "more_region":
      return `${REGION_LABEL[op.region]}を多めにする`;
    case "less_region":
      return `${REGION_LABEL[op.region]}は控えめにする`;
    case "cardio":
      return op.value === "none" ? "有酸素は入れない" : `有酸素は${CARDIO_CHOICE_LABEL[op.value]}にする`;
    case "intensity":
      return `強度は「${INTENSITY_LABEL[op.value]}」にする`;
    case "equipment":
      return `器具は「${EQUIPMENT_STYLE_LABEL[op.value]}」にする`;
    case "time":
      return op.minutes === null ? "時間は制限なしを基本にする" : `時間は${op.minutes}分を基本にする`;
  }
}

/** 希望を目標・メニューの希望に反映する（矛盾する以前の希望は打ち消す） */
export function applyWishOps(goalsIn: Goals | undefined, prefsIn: MenuPreferences | undefined, ops: WishOp[]): { goals: Goals; prefs: MenuPreferences; changes: string[] } {
  let goals = goalsOrDefault(goalsIn);
  const prefs = { ...prefsOrEmpty(prefsIn) };
  const changes: string[] = [];
  for (const op of ops) {
    switch (op.kind) {
      case "like_exercise":
        goals = { ...goals, favoriteExerciseIds: add(goals.favoriteExerciseIds, op.exerciseId) };
        prefs.dislikedExerciseIds = remove(prefs.dislikedExerciseIds, op.exerciseId);
        break;
      case "dislike_exercise":
        goals = { ...goals, favoriteExerciseIds: remove(goals.favoriteExerciseIds, op.exerciseId) };
        prefs.dislikedExerciseIds = add(prefs.dislikedExerciseIds, op.exerciseId);
        break;
      case "more_region":
        goals = { ...goals, priorityRegions: add(goals.priorityRegions, op.region) };
        prefs.lessRegions = remove(prefs.lessRegions, op.region);
        break;
      case "less_region":
        goals = { ...goals, priorityRegions: remove(goals.priorityRegions, op.region) };
        prefs.lessRegions = add(prefs.lessRegions, op.region);
        break;
      case "cardio":
        prefs.cardio = op.value;
        break;
      case "intensity":
        prefs.intensity = op.value;
        break;
      case "equipment":
        prefs.equipmentStyle = op.value;
        goals = { ...goals, preferDumbbell: op.value === "dumbbell" };
        break;
      case "time":
        prefs.timeLimitMin = op.minutes;
        break;
    }
    changes.push(describeWishOp(op));
  }
  return { goals, prefs, changes };
}
