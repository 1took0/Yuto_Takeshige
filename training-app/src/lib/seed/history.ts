import type { CardioEntry, SideRecord, StoreId, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { trainingDayStartISO } from "@/lib/date/trainingDay";

/**
 * 既存トレーニング履歴（ChatGPT運用時代）の正規化データ
 * - 単位は kg。片手種目は片手あたり
 * - 記録にない反復回数・体感は補完しない（actualReps は未設定のまま）
 * - 不明な重量は undefined のまま保存する
 * - 取り込み時刻は不明なため、トレーニング日の 06:00 (Asia/Tokyo) を開始時刻とする
 */
export const SEED_VERSION = 1;

type SetSpec = number | null | { w?: number | null; feel?: WorkoutSet["feel"]; note?: string };
interface ExSpec {
  ex: string;
  /** 重量ベース種目: 各セットの重量（null=不明） */
  weights?: SetSpec[];
  /** 時間ベース種目: 各セットの秒数 */
  seconds?: (number | null)[];
  /** 片手種目: 左右同じ重量（片手あたり） */
  perHand?: number[];
  /** 回数のみの種目: セット数だけ分かっている場合 */
  setsOnly?: number;
  note?: string;
}
interface CardioSpec {
  machine: "bike" | "treadmill";
  totalMin?: number;
  level?: number;
  runMin?: number;
  runSpeedKmh?: number;
  walkSpeedKmh?: number;
  inclinePct?: number;
  longestRunMin?: number;
  note?: string;
  role?: "warmup" | "main";
}
interface SessionSpec {
  date: string;
  store: StoreId;
  notes?: string;
  cardio?: CardioSpec[];
  exercises: ExSpec[];
}

const SESSIONS: SessionSpec[] = [
  {
    date: "2026-09-20",
    store: "ichijoji",
    notes: "初回の重量確認",
    exercises: [
      { ex: "leg_press", weights: [{ w: 20, feel: "easy", note: "少し楽" }] },
      { ex: "chest_press", weights: [{ w: 20, feel: "easy", note: "余裕" }] },
      { ex: "lat_pulldown", weights: [{ w: 30, feel: "ok", note: "ちょうどよい" }] },
      { ex: "leg_curl", weights: [{ w: 35, feel: "hard", note: "少しきつい" }] },
      { ex: "seated_row", weights: [{ w: 30, feel: "ok", note: "ちょうどよい" }] },
      { ex: "abdominal", weights: [{ w: 35, feel: "ok", note: "ちょうどよい" }] },
    ],
  },
  {
    date: "2026-09-26",
    store: "higashiyama-nijo",
    cardio: [{ machine: "bike", totalMin: 5, level: 20, role: "warmup" }],
    exercises: [
      { ex: "leg_press", weights: [20, 30, 40, 40] },
      { ex: "leg_curl", weights: [35, 40, 45] },
      { ex: "leg_extension", weights: [40, 40, 40] },
      { ex: "chest_press", weights: [20, 25, 30, 30] },
      { ex: "lat_pulldown", weights: [30, 35, 30, 30] },
      { ex: "seated_row", weights: [30, 30, 30] },
      { ex: "shoulder_press", weights: [10, 10, 10], note: "左右各10kg" },
      { ex: "abdominal", weights: [35, 35, 40] },
      { ex: "abductor", weights: [30, 30, 30, 35] },
      { ex: "plank", seconds: [60, 60, 60] },
    ],
  },
  {
    date: "2026-09-27",
    store: "higashiyama-nijo",
    cardio: [
      { machine: "bike", totalMin: 7, role: "warmup" },
      { machine: "treadmill", totalMin: 10, walkSpeedKmh: 6, runMin: 0, role: "main", note: "ウォーキング10分 6km/h" },
    ],
    exercises: [
      { ex: "leg_press", weights: [30, 30, 40] },
      { ex: "leg_curl", weights: [35, 40, 40] },
      { ex: "abductor", weights: [30, 35, 35, 40] },
      { ex: "adductor", weights: [35, 35, 35] },
      { ex: "lat_pulldown", weights: [30, 30, 30] },
      { ex: "seated_row", weights: [30, 30] },
      { ex: "abdominal", weights: [35, 40, 45] },
      { ex: "plank", seconds: [60, 60] },
      { ex: "side_plank", seconds: [30, 30], note: "左右各30秒" },
    ],
  },
  {
    date: "2026-09-29",
    store: "ichijoji",
    cardio: [
      { machine: "bike", totalMin: 7, level: 20, role: "warmup" },
      { machine: "treadmill", role: "main", note: "傾斜ウォーキング実施。正確な時間は未報告" },
    ],
    exercises: [
      { ex: "chest_press", weights: [20, 25, 30, 35] },
      { ex: "leg_press", weights: [30, 40, 40] },
      { ex: "lat_pulldown", weights: [30, 30, 35, 35] },
      { ex: "seated_row", weights: [30, 30, 35] },
      { ex: "leg_curl", weights: [35, 40, 40] },
      { ex: "abductor", weights: [35, 40, 40] },
      { ex: "abdominal", weights: [40, 40, 45, 45] },
      { ex: "side_plank", seconds: [40, 40], note: "左右各40秒" },
    ],
  },
  {
    date: "2026-09-30",
    store: "ichijoji",
    notes: "脚の疲労により、レッグカールとアブダクターは省略",
    cardio: [
      { machine: "bike", totalMin: 5, level: 20, role: "warmup", note: "L15→L20" },
      { machine: "treadmill", totalMin: 10, role: "main" },
    ],
    exercises: [
      { ex: "lat_pulldown", weights: [30, 35, 35] },
      { ex: "seated_row", weights: [30, 35] },
      { ex: "chest_press", weights: [30, 30, 35] },
      { ex: "leg_press", weights: [40, 40, 40] },
      { ex: "abdominal", weights: [40, 40, 45] },
    ],
  },
  {
    date: "2026-10-03",
    store: "higashiyama-nijo",
    cardio: [
      { machine: "bike", totalMin: 7, role: "warmup", note: "7分と報告。ただし負荷内訳に時間の不一致がある" },
      { machine: "treadmill", totalMin: 20, role: "main" },
    ],
    exercises: [
      { ex: "leg_curl", weights: [35, 40, 45] },
      { ex: "leg_extension", weights: [40, 40, 40] },
      { ex: "lat_pulldown", weights: [30, 35, 35, 35] },
      { ex: "seated_row", weights: [30, 35, 35] },
      { ex: "leg_press", weights: [40, 40, 50, 50] },
      { ex: "chest_press", weights: [25, 30, 35, 35] },
      { ex: "abductor", weights: [35, 40, 40, 45] },
      { ex: "adductor", weights: [35, 40, 40] },
      { ex: "abdominal", weights: [40, 45, 45, 50] },
      { ex: "shoulder_press", weights: [10, 15] },
      { ex: "plank", seconds: [60, 60] },
      { ex: "side_plank", seconds: [null], note: "実施。詳細未報告" },
    ],
  },
  {
    date: "2026-10-05",
    store: "sanjo-ohashi",
    notes: "軽めのトレーニング",
    exercises: [
      { ex: "pec_fly", weights: [30, 35] },
      { ex: "assisted_chin", weights: [55, 55], note: "補助重量" },
      { ex: "plate_row", weights: [40, 45] },
      { ex: "hip_thrust", weights: [50, 50] },
      { ex: "back_extension", weights: [80, 80] },
      { ex: "pulldown_trainer", perHand: [15], note: "左右各15kg" },
      { ex: "abdominal", weights: [45, 45] },
    ],
  },
  {
    date: "2026-10-06",
    store: "ichijoji",
    notes: "以降、バイセップスカールは15kgを基準とする",
    cardio: [{ machine: "treadmill", totalMin: 3, role: "warmup" }],
    exercises: [
      { ex: "shoulder_press", weights: [25, 25, 25] },
      { ex: "lat_pulldown", weights: [30, 35, 35] },
      { ex: "seated_row", weights: [30, 35, 35] },
      { ex: "chest_press", weights: [30, 35] },
      { ex: "abdominal", weights: [40, 50, 55] },
      {
        ex: "biceps_curl",
        weights: [{ w: 20, feel: "hard" }, { w: 20, feel: "hard", note: "十分に上がらず" }],
        note: "20kgを試したが、十分に上がったのは1セット目のみ（セット数は未報告のため2セットとして記録）",
      },
      { ex: "side_plank", seconds: [40, 40] },
    ],
  },
  {
    date: "2026-10-10",
    store: "ichijoji",
    cardio: [{ machine: "bike", totalMin: 6, level: 20, role: "warmup", note: "L15→L20" }],
    exercises: [
      { ex: "leg_press", weights: [40, 40, 45] },
      { ex: "leg_curl", weights: [35, 40] },
      { ex: "abductor", weights: [35, 40] },
      { ex: "chest_press", weights: [30, 35] },
      { ex: "pec_fly", weights: [30, 30] },
      { ex: "lat_pulldown", weights: [30, 35, 35] },
      { ex: "seated_row", weights: [30, 35] },
      { ex: "biceps_curl", weights: [15, 15, 15] },
      { ex: "abdominal", weights: [45, 50, 50] },
      { ex: "side_plank", seconds: [40, 40], note: "左右各40秒" },
    ],
  },
  {
    date: "2026-10-13",
    store: "ichijoji",
    cardio: [
      { machine: "bike", totalMin: 5, level: 20, role: "warmup", note: "L15 2分→L20 3分" },
      { machine: "treadmill", totalMin: 20, role: "main", note: "ランニング込み。実走時間は未確認" },
    ],
    exercises: [
      { ex: "leg_press", weights: [40, 50, 50] },
      { ex: "leg_curl", weights: [35, 40] },
      { ex: "abductor", weights: [35, 40] },
      { ex: "chest_press", weights: [30, 35, 35] },
      { ex: "pec_fly", weights: [30, 30] },
      { ex: "lat_pulldown", weights: [30, 35, 35] },
      { ex: "seated_row", weights: [30, 35] },
      { ex: "biceps_curl", weights: [15, 15, 15] },
      { ex: "triceps", weights: [30, 35] },
      { ex: "db_hammer_curl_single", perHand: [4, 4] },
      { ex: "abdominal", weights: [45, 50, 50] },
      { ex: "side_plank", seconds: [40, 40], note: "左右各40秒" },
    ],
  },
  {
    date: "2026-10-15",
    store: "ichijoji",
    cardio: [
      { machine: "bike", totalMin: 6, level: 20, role: "warmup", note: "L15 2分→L20 4分" },
      { machine: "treadmill", totalMin: 25, runMin: 8, runSpeedKmh: 12, longestRunMin: 2, role: "main", note: "ランニング 12km/h 2分×4回（合計8分）" },
    ],
    exercises: [
      { ex: "leg_press", weights: [40, 50, 50] },
      { ex: "leg_curl", weights: [35, 40] },
      { ex: "abductor", weights: [40, 45, null], note: "3セット目は重量不明" },
      { ex: "chest_press", weights: [30, 35] },
      { ex: "pec_fly", weights: [30, 30] },
      { ex: "lat_pulldown", weights: [30, 35, 35] },
      { ex: "seated_row", weights: [30, 35] },
      { ex: "triceps", weights: [30, 30] },
      { ex: "biceps_curl", weights: [15, 15] },
      { ex: "db_hammer_curl_single", perHand: [5, 5] },
      { ex: "abdominal", weights: [45, 50] },
      { ex: "knee_leg_raise", setsOnly: 2 },
    ],
  },
  {
    date: "2026-10-16",
    store: "higashiyama-nijo",
    notes: "アームカールベンチが使いにくかったため、通常の片手ダンベルカールに変更",
    cardio: [
      { machine: "bike", totalMin: 5, level: 20, role: "warmup", note: "L15 2分→L20 3分" },
      { machine: "treadmill", totalMin: 25, runMin: 9, runSpeedKmh: 12, role: "main", note: "実走9分、12km/h" },
    ],
    exercises: [
      { ex: "leg_press", weights: [40, 45] },
      { ex: "leg_curl", weights: [30, 35, 40] },
      { ex: "abductor", weights: [35, 40, 45] },
      { ex: "chest_press", weights: [30, 35] },
      { ex: "pec_fly", weights: [30, 30] },
      { ex: "lat_pulldown", weights: [30, 35] },
      { ex: "seated_row", weights: [30, 35] },
      { ex: "db_curl_single", perHand: [5, 5, 6] },
      { ex: "db_hammer_curl_single", perHand: [5, 5, 5] },
      { ex: "abdominal", weights: [40, 45, 50, 55] },
      { ex: "triceps", weights: [30, 30, 30] },
    ],
  },
];

function setId(wid: string, exIdx: number, setIdx: number) {
  return `${wid}_e${exIdx}_s${setIdx}`;
}

function buildExercise(wid: string, exIdx: number, spec: ExSpec): WorkoutExercise {
  const def = getExercise(spec.ex);
  if (!def) throw new Error(`unknown exercise in seed: ${spec.ex}`);
  const sets: WorkoutSet[] = [];
  const base = (i: number): WorkoutSet => ({ id: setId(wid, exIdx, i), completed: true, excluded: false });
  if (spec.weights) {
    spec.weights.forEach((s, i) => {
      const set = base(i);
      if (typeof s === "number") set.weight = s;
      else if (s && typeof s === "object") {
        if (typeof s.w === "number") set.weight = s.w;
        if (s.feel) set.feel = s.feel;
        if (s.note) set.note = s.note;
      }
      sets.push(set);
    });
  } else if (spec.seconds) {
    spec.seconds.forEach((sec, i) => {
      const set = base(i);
      if (typeof sec === "number") {
        set.seconds = sec;
        set.actualSeconds = sec;
        if (def.unilateral) {
          // 左右同じ秒数
          set.left = {};
          set.right = {};
        }
      }
      sets.push(set);
    });
  } else if (spec.perHand) {
    spec.perHand.forEach((w, i) => {
      const set = base(i);
      set.weight = w;
      const side: SideRecord = { weight: w };
      set.left = { ...side };
      set.right = { ...side };
      sets.push(set);
    });
  } else if (spec.setsOnly) {
    for (let i = 0; i < spec.setsOnly; i++) sets.push(base(i));
  }
  return {
    id: `${wid}_e${exIdx}`,
    exerciseId: def.id,
    name: def.name,
    equipmentId: def.equipmentId,
    primary: def.primary,
    sets,
    restSec: def.restSec,
    note: spec.note,
    status: "done",
    weightReference: "same_store",
  };
}

function buildCardio(wid: string, idx: number, c: CardioSpec): CardioEntry {
  return {
    id: `${wid}_c${idx}`,
    machine: c.machine,
    plan: [],
    actual: {
      totalMin: c.totalMin,
      level: c.level,
      runMin: c.runMin,
      runSpeedKmh: c.runSpeedKmh,
      walkSpeedKmh: c.walkSpeedKmh,
      inclinePct: c.inclinePct,
      longestRunMin: c.longestRunMin,
      note: c.note,
    },
    completed: true,
    role: c.role ?? (c.machine === "bike" ? "warmup" : "main"),
  };
}

export function buildSeedWorkouts(): Workout[] {
  return SESSIONS.map((s) => {
    const id = `import_${s.date}_${s.store}`;
    const startedAt = trainingDayStartISO(s.date, 6);
    return {
      id,
      trainingDate: s.date,
      startedAt,
      endedAt: startedAt,
      storeId: s.store,
      exercises: s.exercises.map((e, i) => buildExercise(id, i, e)),
      cardio: (s.cardio ?? []).map((c, i) => buildCardio(id, i, c)),
      status: "completed",
      source: "import",
      notes: s.notes,
      createdAt: startedAt,
      updatedAt: startedAt,
    } satisfies Workout;
  });
}
