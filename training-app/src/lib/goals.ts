import type { Goals, Objective } from "@/lib/types";

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  strength: "筋力向上",
  hypertrophy: "筋肥大",
  fatloss: "体脂肪減少",
  lowback: "腰まわりの安定・腰痛対策",
  grip: "握力・前腕の強化",
  running: "ランニング・心肺機能",
};

/** 新しい利用者の初期値（偏りのない全身トレーニング） */
export const DEFAULT_GOALS: Goals = {
  priorityRegions: [],
  objectives: ["hypertrophy"],
  weakSide: "none",
  favoriteExerciseIds: [],
  runStartSpeedKmh: 8,
};

/** アプリ作成者の目標（既存履歴を取り込む場合の初期値） */
export const OWNER_GOALS: Goals = {
  priorityRegions: ["legs", "glutes", "chest", "back", "abs"],
  objectives: ["strength", "hypertrophy", "fatloss", "lowback", "grip", "running"],
  weakSide: "left",
  favoriteExerciseIds: ["db_hammer_curl_single"],
  runStartSpeedKmh: 10,
};

export function goalsOrDefault(g: Goals | undefined): Goals {
  return { ...DEFAULT_GOALS, ...(g ?? {}) };
}

export function wantsCardio(g: Goals): boolean {
  return g.objectives.includes("fatloss") || g.objectives.includes("running");
}

/** 筋力重視（筋肥大を選んでいない）なら回数を少なめに */
export function strengthFocused(g: Goals): boolean {
  return g.objectives.includes("strength") && !g.objectives.includes("hypertrophy");
}
