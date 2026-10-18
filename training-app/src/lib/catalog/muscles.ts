import type { BodyRegion, FocusArea, MuscleGroup } from "@/lib/types";

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "胸",
  back: "背中",
  lats: "広背筋",
  shoulders: "肩",
  biceps: "上腕二頭筋",
  triceps: "上腕三頭筋",
  forearms: "前腕",
  quads: "大腿四頭筋",
  hamstrings: "ハムストリングス",
  glutes: "お尻",
  adductors: "内もも",
  abductors: "中殿筋・外もも",
  calves: "ふくらはぎ",
  abs: "腹直筋",
  obliques: "腹斜筋",
  core: "体幹",
  lower_back: "腰・脊柱起立筋",
};

export const REGION_LABEL: Record<BodyRegion, string> = {
  chest: "胸",
  back: "背中",
  legs: "脚",
  glutes: "お尻",
  shoulders: "肩",
  arms: "腕",
  abs: "腹筋",
  lower_back: "腰",
};

export const REGION_ORDER: BodyRegion[] = [
  "chest",
  "back",
  "legs",
  "glutes",
  "shoulders",
  "arms",
  "abs",
  "lower_back",
];

export const FOCUS_LABEL: Record<FocusArea, string> = {
  auto: "おまかせ",
  full: "全身",
  lower: "下半身",
  chest_back: "胸・背中",
  arms_shoulders: "腕・肩",
  abs_core: "腹筋・体幹",
};

/** 筋群 → ヒアリング部位 */
export const MUSCLE_TO_REGION: Record<MuscleGroup, BodyRegion> = {
  chest: "chest",
  back: "back",
  lats: "back",
  shoulders: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  quads: "legs",
  hamstrings: "legs",
  glutes: "glutes",
  adductors: "legs",
  abductors: "glutes",
  calves: "legs",
  abs: "abs",
  obliques: "abs",
  core: "abs",
  lower_back: "lower_back",
};

export function musclesLabel(ms: MuscleGroup[]): string {
  return ms.map((m) => MUSCLE_LABEL[m]).join("・");
}
