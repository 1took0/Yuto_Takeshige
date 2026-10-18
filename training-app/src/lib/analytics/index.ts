import type { BodyRegion, MuscleGroup, StoreId, Workout } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { MUSCLE_TO_REGION } from "@/lib/catalog/muscles";
import { countedSets, sortByDateDesc } from "@/lib/planner/history";
import { diffDays, monthOf, shiftYMD, weekStartOf } from "@/lib/date/trainingDay";

export interface WeightPoint {
  date: string;
  storeId: StoreId;
  /** その日の最大重量（完了セットのみ） */
  maxWeight: number;
  /** ワーキング重量（最後のセット） */
  workingWeight: number;
  sets: number;
  /** 推定1RM（実回数が記録されたセットのみ。無ければ undefined） */
  e1rm?: number;
  /** 片手種目の左右 */
  left?: number;
  right?: number;
  /** 系列キー：店舗ごとに区別 */
  series: string;
}

/** Epley 式。実回数が記録されていない場合は計算しない */
export function epley(weight: number, reps: number): number {
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function weightTrend(ws: Workout[], exerciseId: string): WeightPoint[] {
  const out: WeightPoint[] = [];
  for (const w of [...sortByDateDesc(ws)].reverse()) {
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      const sets = countedSets(e);
      const weights = sets.map((s) => s.weight ?? s.left?.weight).filter((x): x is number => typeof x === "number");
      if (!weights.length) continue;
      let e1rm: number | undefined;
      for (const s of sets) {
        if (typeof s.weight === "number" && typeof s.actualReps === "number" && s.actualReps > 0) {
          const v = epley(s.weight, s.actualReps);
          e1rm = e1rm === undefined ? v : Math.max(e1rm, v);
        }
      }
      const lefts = sets.map((s) => s.left?.weight).filter((x): x is number => typeof x === "number");
      const rights = sets.map((s) => s.right?.weight).filter((x): x is number => typeof x === "number");
      out.push({
        date: w.trainingDate,
        storeId: w.storeId,
        maxWeight: Math.max(...weights),
        workingWeight: weights[weights.length - 1],
        sets: sets.length,
        e1rm,
        left: lefts.length ? Math.max(...lefts) : undefined,
        right: rights.length ? Math.max(...rights) : undefined,
        series: `${exerciseId}@${w.storeId}`,
      });
    }
  }
  return out;
}

export interface VolumePoint {
  date: string;
  storeId: StoreId;
  totalSets: number;
  exercises: number;
  /** 総負荷量 (kg×回) は実回数があるセットのみ */
  tonnage?: number;
}

export function volumeTrend(ws: Workout[]): VolumePoint[] {
  return [...sortByDateDesc(ws)].reverse().map((w) => {
    let totalSets = 0;
    let tonnage = 0;
    let hasTonnage = false;
    for (const e of w.exercises) {
      const sets = countedSets(e);
      totalSets += sets.length;
      for (const s of sets) {
        if (typeof s.weight === "number" && typeof s.actualReps === "number") {
          tonnage += s.weight * s.actualReps;
          hasTonnage = true;
        }
      }
    }
    return { date: w.trainingDate, storeId: w.storeId, totalSets, exercises: w.exercises.filter((e) => countedSets(e).length).length, tonnage: hasTonnage ? tonnage : undefined };
  });
}

/** 部位ごとのトレーニング頻度（期間内のセット数と最終実施日） */
export function regionFrequency(ws: Workout[], sinceDays = 28, today: string): { region: BodyRegion; sets: number; sessions: number; lastDate?: string; daysSince?: number }[] {
  const map = new Map<BodyRegion, { sets: number; sessions: Set<string>; lastDate?: string }>();
  for (const w of sortByDateDesc(ws)) {
    const age = diffDays(today, w.trainingDate);
    for (const e of w.exercises) {
      const sets = countedSets(e).length;
      if (!sets) continue;
      const def = getExercise(e.exerciseId);
      const regions = new Set<BodyRegion>((def?.primary ?? e.primary).map((m: MuscleGroup) => MUSCLE_TO_REGION[m]));
      for (const r of regions) {
        const cur = map.get(r) ?? { sets: 0, sessions: new Set<string>() };
        if (age < sinceDays) {
          cur.sets += sets;
          cur.sessions.add(w.id);
        }
        if (!cur.lastDate) cur.lastDate = w.trainingDate;
        map.set(r, cur);
      }
    }
  }
  const order: BodyRegion[] = ["legs", "glutes", "chest", "back", "shoulders", "arms", "abs", "lower_back"];
  return order.map((region) => {
    const v = map.get(region);
    return { region, sets: v?.sets ?? 0, sessions: v?.sessions.size ?? 0, lastDate: v?.lastDate, daysSince: v?.lastDate ? diffDays(today, v.lastDate) : undefined };
  });
}

export interface StoreStat {
  storeId: StoreId;
  sessions: number;
  lastDate?: string;
}
export function storeStats(ws: Workout[]): StoreStat[] {
  const m = new Map<StoreId, StoreStat>();
  for (const w of sortByDateDesc(ws)) {
    const cur = m.get(w.storeId) ?? { storeId: w.storeId, sessions: 0, lastDate: w.trainingDate };
    cur.sessions++;
    m.set(w.storeId, cur);
  }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions);
}

/** 左右差（片手種目）：最新の左右重量と回数 */
export function lateralDifference(ws: Workout[]): { exerciseId: string; name: string; date: string; left?: number; right?: number; leftReps?: number; rightReps?: number }[] {
  const seen = new Set<string>();
  const out = [];
  for (const w of sortByDateDesc(ws)) {
    for (const e of w.exercises) {
      const def = getExercise(e.exerciseId);
      if (!def?.unilateral || seen.has(e.exerciseId)) continue;
      const sets = countedSets(e).filter((s) => s.left || s.right);
      if (!sets.length) continue;
      const last = sets[sets.length - 1];
      seen.add(e.exerciseId);
      out.push({ exerciseId: e.exerciseId, name: e.name, date: w.trainingDate, left: last.left?.weight, right: last.right?.weight, leftReps: last.left?.actualReps, rightReps: last.right?.actualReps });
    }
  }
  return out;
}

export interface RunPoint {
  date: string;
  totalMin?: number;
  runMin?: number;
  speed?: number;
  distanceKm?: number;
  longestRunMin?: number;
  planned: boolean;
}
export function runTrend(ws: Workout[]): RunPoint[] {
  const out: RunPoint[] = [];
  for (const w of [...sortByDateDesc(ws)].reverse()) {
    for (const c of w.cardio) {
      if (c.machine !== "treadmill" || !c.completed) continue;
      const a = c.actual;
      if (!a) continue;
      const dist = a.distanceKm ?? (a.runMin && a.runSpeedKmh ? Math.round(((a.runMin * a.runSpeedKmh) / 60) * 100) / 100 : undefined);
      out.push({ date: w.trainingDate, totalMin: a.totalMin, runMin: a.runMin, speed: a.runSpeedKmh, distanceKm: dist, longestRunMin: a.longestRunMin, planned: c.plan.length > 0 });
    }
  }
  return out;
}

export function weeklyCounts(ws: Workout[], weeks = 8, today: string): { week: string; count: number; sets: number }[] {
  const start = weekStartOf(today);
  const buckets = new Map<string, { count: number; sets: number }>();
  for (let i = weeks - 1; i >= 0; i--) buckets.set(shiftYMD(start, -7 * i), { count: 0, sets: 0 });
  for (const w of ws) {
    if (w.status !== "completed") continue;
    const wk = weekStartOf(w.trainingDate);
    const b = buckets.get(wk);
    if (!b) continue;
    b.count++;
    b.sets += w.exercises.reduce((a, e) => a + countedSets(e).length, 0);
  }
  return [...buckets.entries()].map(([week, v]) => ({ week, ...v }));
}

export function monthlyCounts(ws: Workout[]): { month: string; count: number }[] {
  const m = new Map<string, number>();
  for (const w of ws) if (w.status === "completed") m.set(monthOf(w.trainingDate), (m.get(monthOf(w.trainingDate)) ?? 0) + 1);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}

/** 直近 n 日のカレンダー（トレーニング日 / 休息日） */
export function restDayCalendar(ws: Workout[], days = 28, today: string): { date: string; trained: boolean; storeId?: StoreId }[] {
  const byDate = new Map<string, StoreId>();
  for (const w of ws) if (w.status === "completed") byDate.set(w.trainingDate, w.storeId);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftYMD(today, -i);
    out.push({ date: d, trained: byDate.has(d), storeId: byDate.get(d) });
  }
  return out;
}

export function exercisesInHistory(ws: Workout[]): { id: string; name: string; count: number }[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const w of ws) for (const e of w.exercises) if (countedSets(e).length) m.set(e.exerciseId, { name: e.name, count: (m.get(e.exerciseId)?.count ?? 0) + 1 });
  return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
}
