import type { CardioEntry, CardioPreference, CardioSegment, IntakeAnswers } from "@/lib/types";
import { newId } from "@/lib/id";
import type { RunSummary } from "./history";

const WALK_SPEED = 5.5;
const DEFAULT_RUN_SPEED = 12;

function seg(kind: CardioSegment["kind"], durationMin: number, extra: Partial<CardioSegment> = {}): CardioSegment {
  return { id: newId("seg"), kind, durationSec: Math.round(durationMin * 60), ...extra };
}

/** ウォームアップ用バイク（ユーザーの実績パターン: L15 2分 → L20 残り） */
export function bikeWarmup(minutes: number, light = false): CardioEntry {
  const total = Math.max(3, Math.round(minutes));
  const l1 = light ? 12 : 15;
  const l2 = light ? 16 : 20;
  const plan: CardioSegment[] = total <= 3 ? [seg("bike", total, { level: l1, label: `バイク L${l1}` })] : [seg("bike", 2, { level: l1, label: `バイク L${l1}` }), seg("bike", total - 2, { level: l2, label: `バイク L${l2}` })];
  return {
    id: newId("cardio"),
    machine: "bike",
    plan,
    completed: false,
    role: "warmup",
    rationale: `ウォームアップ ${total}分。前半は軽め、後半 L${l2}`,
  };
}

export interface TreadmillDecision {
  mode: CardioPreference;
  reason?: string;
}

/** 希望は尊重しつつ、疲労や体調によりウォーキングに切り替える */
export function decideTreadmillMode(intake: IntakeAnswers): TreadmillDecision {
  if (intake.cardio === "walk") return { mode: "walk" };
  const legsSore = intake.soreness && (intake.soreRegions.includes("legs") || intake.soreRegions.includes("glutes"));
  if (legsSore && intake.soreLevel && intake.soreLevel !== "light") {
    return { mode: "walk", reason: "脚・お尻に中程度以上の疲労があるためウォーキングに変更" };
  }
  if (intake.condition <= 2) return { mode: "walk", reason: "体調が優れないためウォーキングに変更" };
  if (intake.pain.present && /膝|足首|脚|ふくらはぎ|すね|股関節|腰/.test(intake.pain.description ?? "")) {
    return { mode: "walk", reason: "痛み・違和感があるためランニングは見送り" };
  }
  return { mode: "run" };
}

export interface RunTarget {
  speedKmh: number;
  totalRunMin: number;
  intervalMin: number;
  rationale: string;
}

/**
 * ランニング進行の目標
 * - 連続走行時間を段階的に伸ばす。速度と時間を同時に大きく上げない
 * - 前回の実績（実走時間）が無ければ計画値も達成とみなさず、控えめに
 */
export function nextRunTarget(history: RunSummary[], legsLightlySore = false): RunTarget {
  const withRun = history.filter((h) => typeof h.runMin === "number" && h.runMin > 0);
  if (!withRun.length) {
    return { speedKmh: 10, totalRunMin: 6, intervalMin: 2, rationale: "ランニング実績がないため 10km/h 2分×3本から開始" };
  }
  const last = withRun[0];
  const speed = last.runSpeedKmh ?? DEFAULT_RUN_SPEED;
  const lastRun = last.runMin!;
  const prevLongest = last.longestRunMin ?? Math.min(lastRun, 2);
  // 直近2回とも同じ速度で、合計15分以上走れていれば速度を 0.5 上げて時間は据え置き
  const prev = withRun[1];
  const stable = prev && (prev.runSpeedKmh ?? DEFAULT_RUN_SPEED) === speed && (prev.runMin ?? 0) >= 15 && lastRun >= 15;
  if (stable && !legsLightlySore) {
    return {
      speedKmh: speed + 0.5,
      totalRunMin: lastRun,
      intervalMin: Math.min(prevLongest, 5),
      rationale: `2回連続で${speed}km/hを${lastRun}分走れているため、時間は据え置きで速度を+0.5km/h`,
    };
  }
  // 時間を伸ばす: 比較的早いペースで +2分（上限 +25%）、連続時間は +1分
  const inc = legsLightlySore ? 1 : 2;
  const total = Math.min(lastRun + inc, Math.ceil(lastRun * 1.25) + 1, 30);
  const interval = Math.min(prevLongest + 1, 6);
  return {
    speedKmh: speed,
    totalRunMin: total,
    intervalMin: interval,
    rationale: `前回 ${speed}km/h×${lastRun}分（最長${prevLongest}分）→ 速度は据え置き、合計${total}分・1本${interval}分へ${legsLightlySore ? "（脚の疲労があるため控えめ）" : ""}`,
  };
}

/** 区間表を組み立てる（合計 budgetMin 以内） */
export function buildTreadmillPlan(mode: CardioPreference, budgetMin: number, target?: RunTarget, inclineWalk = true): CardioSegment[] {
  const budget = Math.max(5, Math.round(budgetMin));
  if (mode === "walk") {
    const segs: CardioSegment[] = [];
    if (budget <= 8) return [seg("walk", budget, { speedKmh: WALK_SPEED, inclinePct: inclineWalk ? 3 : 0, label: "ウォーキング" })];
    segs.push(seg("walk", 3, { speedKmh: WALK_SPEED, inclinePct: 0, label: "ウォーキング" }));
    const mid = budget - 6;
    segs.push(seg("walk", mid, { speedKmh: inclineWalk ? 5.5 : 6, inclinePct: inclineWalk ? 5 : 0, label: inclineWalk ? "傾斜ウォーキング" : "早歩き" }));
    segs.push(seg("cooldown", 3, { speedKmh: 5, inclinePct: 0, label: "クールダウン" }));
    return segs;
  }
  const t = target!;
  const warm = budget >= 20 ? 3 : 2;
  const cool = budget >= 20 ? 2 : 1;
  const walkBetween = 2;
  let count = Math.max(1, Math.ceil(t.totalRunMin / t.intervalMin));
  // 予算に収まるまで本数を減らす
  const totalFor = (n: number, runMin: number) => warm + runMin + Math.max(0, n - 1) * walkBetween + cool;
  let runTotal = t.totalRunMin;
  while (count > 1 && totalFor(count, runTotal) > budget) {
    count--;
    runTotal = Math.min(runTotal, count * t.intervalMin);
  }
  while (totalFor(count, runTotal) > budget && runTotal > 2) runTotal--;
  // 1本あたりの長さを配分（最後の本に端数）
  const lengths: number[] = [];
  let rem = runTotal;
  for (let i = 0; i < count; i++) {
    const l = i === count - 1 ? rem : Math.min(t.intervalMin, rem - (count - 1 - i));
    lengths.push(Math.max(1, l));
    rem -= Math.max(1, l);
  }
  const segs: CardioSegment[] = [seg("walk", warm, { speedKmh: WALK_SPEED, inclinePct: 0, label: "ウォーキング" })];
  lengths.forEach((l, i) => {
    segs.push(seg("run", l, { speedKmh: t.speedKmh, inclinePct: 0, label: "ランニング" }));
    if (i < lengths.length - 1) segs.push(seg("walk", walkBetween, { speedKmh: WALK_SPEED, inclinePct: 0, label: "ウォーキング" }));
  });
  segs.push(seg("cooldown", cool, { speedKmh: 5, inclinePct: 0, label: "クールダウン" }));
  return segs;
}

export function treadmillEntry(mode: CardioPreference, plan: CardioSegment[], rationale: string): CardioEntry {
  return { id: newId("cardio"), machine: "treadmill", plan, completed: false, role: "main", rationale: `${mode === "run" ? "ランニング" : "ウォーキング"}：${rationale}` };
}

export function planTotalMin(plan: CardioSegment[]): number {
  return plan.reduce((a, s) => a + s.durationSec, 0) / 60;
}

export function planRunMin(plan: CardioSegment[]): number {
  return plan.filter((s) => s.kind === "run").reduce((a, s) => a + s.durationSec, 0) / 60;
}

/** 計画からおおよその距離(km) */
export function planDistanceKm(plan: CardioSegment[]): number {
  return plan.reduce((a, s) => a + ((s.speedKmh ?? 0) * s.durationSec) / 3600, 0);
}
