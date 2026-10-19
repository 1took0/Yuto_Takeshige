/**
 * ドメインモデル定義
 * - 「予定(planned)」と「実績(actual)」を厳密に区別する
 * - 反復回数が未報告の場合は actualReps を undefined のまま保持し、推測で補完しない
 */

/** 最初から登録されている店舗 */
export type BuiltinStoreId = "ichijoji" | "higashiyama-nijo" | "sanjo-ohashi";
/** 店舗ID（追加した店舗は "custom-xxxx"） */
export type StoreId = string;

export type MuscleGroup =
  | "chest"
  | "back"
  | "lats"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "adductors"
  | "abductors"
  | "calves"
  | "abs"
  | "obliques"
  | "core"
  | "lower_back";

/** ヒアリングで選ぶ疲労部位（大まかな部位） */
export type BodyRegion =
  | "chest"
  | "back"
  | "legs"
  | "glutes"
  | "shoulders"
  | "arms"
  | "abs"
  | "lower_back";

export type FocusArea =
  | "auto"
  | "full"
  | "lower"
  | "chest_back"
  | "arms_shoulders"
  | "abs_core";

export type CardioPreference = "walk" | "run";
/** その日の有酸素の選択（"none" はトレッドミルを入れない） */
export type CardioChoice = CardioPreference | "none";

export type LoadType = "weight" | "assist" | "time" | "reps" | "level";

export interface EquipmentDef {
  id: string;
  name: string;
  category: "machine" | "free" | "cardio" | "bodyweight" | "bench";
}

export interface ExerciseDef {
  id: string;
  name: string;
  /** 利用者が作成した種目 */
  custom?: boolean;
  /** 自作種目をメニュー自動作成の候補に含める */
  autoMenu?: boolean;
  /** 使用器具（bodyweight の場合は未指定でもよい） */
  equipmentId: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  regions: BodyRegion[];
  loadType: LoadType;
  /** 片手・片側で行う種目（左右別記録が可能） */
  unilateral?: boolean;
  defaultSets: number;
  defaultReps?: number;
  defaultSeconds?: number;
  restSec: number;
  /** 1セットにかかる概算秒数（動作のみ、休憩除く） */
  workSec: number;
  /** 重量を上げる際の刻み(kg) */
  increment: number;
  form: string[];
  setup: string[];
  cautions: string[];
  /** 優先度（高いほど採用されやすい） */
  priority: number;
  /** 将来導入候補など、通常は自動提案しない */
  optional?: boolean;
}

export interface StoreDef {
  id: StoreId;
  name: string;
  shortName: string;
  /** 利用者が追加した店舗 */
  custom?: boolean;
}

/** 店舗ごとの器具の有無 */
export interface StoreEquipment {
  /** `${storeId}:${equipmentId}` */
  key: string;
  storeId: StoreId;
  equipmentId: string;
  available: boolean;
  /** 利用実績が確認できている（推測ではない） */
  confirmed: boolean;
  note?: string;
  updatedAt: string;
}

export type Side = "left" | "right";

export interface SideRecord {
  weight?: number;
  reps?: number;
  actualReps?: number;
}

export interface WorkoutSet {
  id: string;
  /** 目標重量(kg)。片手種目は片手あたり */
  weight?: number;
  /** 目標回数 */
  reps?: number;
  /** 実際の回数（未入力なら undefined。目標達成とみなさない） */
  actualReps?: number;
  /** 時間種目(プランク等)の目標秒数 */
  seconds?: number;
  actualSeconds?: number;
  /** 片手種目の左右別記録（指定があれば weight/reps より優先） */
  left?: SideRecord;
  right?: SideRecord;
  completed: boolean;
  /** 完了チェックを付けた時刻（ISO）。種目ごとの所要時間の計算に使う */
  completedAt?: string;
  /** 未実施として記録から除外 */
  excluded: boolean;
  /** 体感 */
  feel?: "easy" | "ok" | "hard";
  note?: string;
}

export type ExerciseStatus = "planned" | "done" | "skipped";

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  /** 表示名（カタログから複製。カタログ変更に影響されない） */
  name: string;
  equipmentId?: string;
  primary: MuscleGroup[];
  sets: WorkoutSet[];
  restSec: number;
  /** メニュー作成時の根拠・メモ（AI/ルールエンジンの説明） */
  rationale?: string;
  /** ユーザーメモ */
  note?: string;
  /** 前回実績の要約（表示用） */
  previous?: PreviousPerformance;
  status: ExerciseStatus;
  /** 重量の参考元が別店舗の場合など、同一負荷とみなせないときに true */
  weightReference?: "same_store" | "other_store" | "none";
}

export interface PreviousPerformance {
  workoutId: string;
  trainingDate: string;
  storeId: StoreId;
  sets: { weight?: number; reps?: number; actualReps?: number; seconds?: number; left?: SideRecord; right?: SideRecord }[];
}

export type CardioMachine = "bike" | "treadmill";
export type SegmentKind = "walk" | "run" | "bike" | "cooldown" | "warmup";

export interface CardioSegment {
  id: string;
  kind: SegmentKind;
  durationSec: number;
  speedKmh?: number;
  speedMaxKmh?: number;
  inclinePct?: number;
  /** バイクの負荷レベル */
  level?: number;
  label?: string;
}

export interface CardioActual {
  totalMin?: number;
  runMin?: number;
  runSpeedKmh?: number;
  walkSpeedKmh?: number;
  distanceKm?: number;
  inclinePct?: number;
  level?: number;
  /** 連続走行の最長時間(分) */
  longestRunMin?: number;
  note?: string;
}

export interface CardioEntry {
  id: string;
  machine: CardioMachine;
  /** 計画（区間表） */
  plan: CardioSegment[];
  /** 実績（計画と区別して保存） */
  actual?: CardioActual;
  completed: boolean;
  skipped?: boolean;
  /** ウォームアップ目的か、メインの有酸素か */
  role: "warmup" | "main";
  rationale?: string;
}

/** トレーニング時間の内訳（分） */
export interface WorkoutDurations {
  totalMin?: number;
  machineMin?: number;
  dumbbellMin?: number;
  bodyweightMin?: number;
  cardioMin?: number;
  /** 利用者が手で修正した */
  manual?: boolean;
}

export interface Pain {
  present: boolean;
  description?: string;
}

export interface IntakeAnswers {
  storeId: StoreId;
  /** 分。null は制限なし */
  timeLimitMin: number | null;
  condition: 1 | 2 | 3 | 4 | 5;
  soreness: boolean;
  soreRegions: BodyRegion[];
  soreLevel?: "light" | "moderate" | "severe";
  pain: Pain;
  focus: FocusArea;
  cardio: CardioChoice;
  memo?: string;
}

export type WorkoutStatus = "active" | "completed";

export interface Workout {
  id: string;
  /** トレーニング日（午前6時区切り、Asia/Tokyo）YYYY-MM-DD */
  trainingDate: string;
  startedAt: string; // ISO
  endedAt?: string;
  storeId: StoreId;
  /** 記録時点の店舗名（店舗の削除後や、他の人の記録の表示に使う） */
  storeLabel?: string;
  /** トレーニング時間の内訳（分）。終了時に自動計算し、手で修正もできる */
  durations?: WorkoutDurations;
  intake?: IntakeAnswers;
  exercises: WorkoutExercise[];
  cardio: CardioEntry[];
  /** 種目と有酸素を合わせた表示順（id の並び）。未設定ならウォームアップ → 種目 → 有酸素 */
  itemOrder?: string[];
  status: WorkoutStatus;
  source: "app" | "import";
  /** 折りたたみ等のUI状態 */
  ui?: { focusedExerciseId?: string | null };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: "settings";
  theme: "system" | "light" | "dark";
  lastStoreId?: StoreId;
  lastTimeLimitMin?: number | null;
  lastCardio?: CardioChoice;
  sound: boolean;
  vibration: boolean;
  keepAwake: boolean;
  /** セット間の休憩タイマーの時間（秒）。未設定・null は種目ごとの標準 */
  restTimerSec?: number | null;
  /** 自動プランから除外する種目ID */
  excludedExerciseIds: string[];
  /** 利用者が追加した店舗 */
  customStores?: StoreDef[];
  /** 利用者が作成した種目 */
  customExercises?: ExerciseDef[];
  seedVersion?: number;
  /** 初回設定（名前・目標・履歴取り込み）が済んでいるか */
  onboarded?: boolean;
  profile?: Profile;
  goals?: Goals;
  /** メニューの希望（初回ヒアリングと、その後に伝えられた希望） */
  preferences?: MenuPreferences;
  /** 記録をアプリ利用者全員に共有するか（本人が選択） */
  sharing?: boolean;
  /** 共有サーバーへの未送信変更があるか */
  shareDirty?: boolean;
  lastSharedAt?: string;
  /** 共有サーバーに送った記録の形式（2 = 要約のみ） */
  shareFormat?: number;
  updatedAt: string;
}

/** 利用者のプロフィール（端末内で生成。サーバー登録は共有を有効にしたときのみ） */
export interface Profile {
  userId: string;
  displayName: string;
  /** 共有データの更新・削除に使う秘密トークン（サーバーにはハッシュのみ保存） */
  shareToken: string;
  createdAt: string;
}

export type Objective = "strength" | "hypertrophy" | "fatloss" | "lowback" | "grip" | "running";

/** 人ごとに編集できるトレーニング目標 */
export interface Goals {
  /** 特に鍛えたい部位 */
  priorityRegions: BodyRegion[];
  objectives: Objective[];
  /** 筋力が弱い側（片手種目の進め方に使う） */
  weakSide: "none" | "left" | "right";
  /** 定期的に入れたい種目 */
  favoriteExerciseIds: string[];
  /** ランニング実績がないときの開始速度(km/h) */
  runStartSpeedKmh: number;
  /** マシンよりダンベル種目を優先する */
  preferDumbbell?: boolean;
}

export type Experience = "new" | "beginner" | "intermediate" | "advanced";
export type Intensity = "light" | "normal" | "hard";
export type EquipmentStyle = "machine" | "balanced" | "dumbbell";

/** 利用者から伝えられた希望の記録（何をどう反映したか） */
export interface PreferenceNote {
  id: string;
  text: string;
  /** 反映した内容（表示用） */
  changes: string[];
  createdAt: string;
}

/**
 * メニューの希望
 * - 増やしたい部位・やりたい種目・ダンベル優先は Goals 側（priorityRegions / favoriteExerciseIds / preferDumbbell）に持つ
 * - ここにはそれ以外の、メニュー作成で毎回考慮する希望を持つ
 */
export interface MenuPreferences {
  /** 初回ヒアリングに答えた日時（未回答なら初回トレーニング時に質問する） */
  answeredAt?: string;
  experience?: Experience;
  intensity?: Intensity;
  equipmentStyle?: EquipmentStyle;
  /** 有酸素の希望（毎回のヒアリングの初期値にもなる） */
  cardio?: CardioChoice;
  /** 1回のトレーニング時間の希望（分、null は制限なし） */
  timeLimitMin?: number | null;
  /** 控えたい部位 */
  lessRegions?: BodyRegion[];
  /** やりたくない種目（自動作成では選ばない） */
  dislikedExerciseIds?: string[];
  /** 普段から気をつけたいケガ・痛み（毎回の除外判定に使う） */
  chronicPain?: string;
  notes?: PreferenceNote[];
}

/** 計画の構造化パッチ（AI/ルールエンジンは予定のみ変更し、実績には触れない） */
export type PlanPatchOp =
  | { op: "remove_exercise"; exerciseId: string; reason?: string }
  | { op: "add_exercise"; exerciseId: string; sets?: number; weight?: number; reps?: number; reason?: string }
  | { op: "replace_exercise"; from: string; to: string; reason?: string }
  | { op: "set_weight"; exerciseId: string; weight: number; reason?: string }
  | { op: "set_sets"; exerciseId: string; sets: number; reason?: string }
  | { op: "set_reps"; exerciseId: string; reps: number; reason?: string }
  | { op: "set_cardio"; machine: CardioMachine; segments: Omit<CardioSegment, "id">[]; reason?: string }
  | { op: "remove_cardio"; machine: CardioMachine; reason?: string }
  | { op: "reorder"; exerciseIds: string[]; reason?: string };

export interface PlanPatch {
  message: string;
  ops: PlanPatchOp[];
}
