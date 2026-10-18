import type { StoreEquipment, Workout } from "@/lib/types";
import { workoutStoreName } from "@/lib/catalog/stores";

export interface ExportBundle {
  app: "training-coach";
  version: 1;
  exportedAt: string;
  workouts: Workout[];
  storeEquipment: StoreEquipment[];
}

export function toJSON(workouts: Workout[], storeEquipment: StoreEquipment[]): string {
  const bundle: ExportBundle = { app: "training-coach", version: 1, exportedAt: new Date().toISOString(), workouts, storeEquipment };
  return JSON.stringify(bundle, null, 2);
}

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** セット単位の CSV（筋トレ）。未完了・除外セットは含めない */
export function setsToCSV(workouts: Workout[]): string {
  const header = ["trainingDate", "store", "workoutId", "exerciseId", "exercise", "setIndex", "weightKg", "targetReps", "actualReps", "targetSec", "actualSec", "leftKg", "leftReps", "rightKg", "rightReps", "feel", "note"];
  const rows = [header.join(",")];
  const sorted = [...workouts].sort((a, b) => a.trainingDate.localeCompare(b.trainingDate));
  for (const w of sorted) {
    if (w.status !== "completed") continue;
    for (const e of w.exercises) {
      e.sets.forEach((s, i) => {
        if (!s.completed || s.excluded) return;
        rows.push(
          [w.trainingDate, workoutStoreName(w, true), w.id, e.exerciseId, e.name, i + 1, s.weight, s.reps, s.actualReps, s.seconds, s.actualSeconds, s.left?.weight, s.left?.actualReps, s.right?.weight, s.right?.actualReps, s.feel, s.note ?? e.note]
            .map(csvCell)
            .join(","),
        );
      });
    }
  }
  return "﻿" + rows.join("\n");
}

/** 有酸素の CSV（計画と実績を別列で） */
export function cardioToCSV(workouts: Workout[]): string {
  const header = ["trainingDate", "store", "machine", "role", "completed", "planTotalMin", "planRunMin", "planRunSpeedKmh", "actualTotalMin", "actualRunMin", "actualRunSpeedKmh", "actualLongestRunMin", "actualDistanceKm", "actualInclinePct", "actualLevel", "note"];
  const rows = [header.join(",")];
  const sorted = [...workouts].sort((a, b) => a.trainingDate.localeCompare(b.trainingDate));
  for (const w of sorted) {
    if (w.status !== "completed") continue;
    for (const c of w.cardio) {
      const planTotal = c.plan.reduce((a, s) => a + s.durationSec, 0) / 60;
      const planRun = c.plan.filter((s) => s.kind === "run").reduce((a, s) => a + s.durationSec, 0) / 60;
      const planSpeed = c.plan.find((s) => s.kind === "run")?.speedKmh;
      rows.push([w.trainingDate, workoutStoreName(w, true), c.machine, c.role, c.completed, planTotal || "", planRun || "", planSpeed, c.actual?.totalMin, c.actual?.runMin, c.actual?.runSpeedKmh, c.actual?.longestRunMin, c.actual?.distanceKm, c.actual?.inclinePct, c.actual?.level, c.actual?.note].map(csvCell).join(","));
    }
  }
  return "﻿" + rows.join("\n");
}

export function parseImport(text: string): ExportBundle {
  const j = JSON.parse(text);
  if (!j || j.app !== "training-coach" || !Array.isArray(j.workouts)) throw new Error("このアプリのエクスポートファイルではありません");
  return j as ExportBundle;
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
