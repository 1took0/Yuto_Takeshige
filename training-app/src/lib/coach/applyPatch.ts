import type { PlanPatch, PlanPatchOp, Workout } from "@/lib/types";
import { getExercise } from "@/lib/catalog/exercises";
import { addExercise, removeExercise, updateExercise, updateSet } from "@/lib/workout/edit";
import { newId } from "@/lib/id";

/**
 * 構造化パッチをワークアウトに適用する
 * - 予定（重量・回数・セット数・種目構成・有酸素計画）のみを変更
 * - 完了済みセットの実績（completed / actualReps / actualSeconds / 有酸素 actual）には一切触れない
 */
export function applyPlanPatch(w: Workout, patch: PlanPatch): { workout: Workout; applied: string[]; skipped: string[] } {
  let cur = w;
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const op of patch.ops) {
    const r = applyOp(cur, op);
    if (r) {
      cur = r.workout;
      applied.push(r.label);
    } else skipped.push(describeOp(op));
  }
  return { workout: cur, applied, skipped };
}

function findEx(w: Workout, exerciseId: string) {
  return w.exercises.find((e) => e.exerciseId === exerciseId || e.id === exerciseId);
}

function applyOp(w: Workout, op: PlanPatchOp): { workout: Workout; label: string } | null {
  switch (op.op) {
    case "remove_exercise": {
      const e = findEx(w, op.exerciseId);
      if (!e) return null;
      // 完了済みセットがある種目は削除せず、未完了セットだけ除外する（実績保護）
      if (e.sets.some((s) => s.completed)) {
        const sets = e.sets.map((s) => (s.completed ? s : { ...s, excluded: true }));
        return { workout: updateExercise(w, e.id, { sets }), label: `${e.name}：残りのセットを除外` };
      }
      return { workout: removeExercise(w, e.id), label: `${e.name} を削除` };
    }
    case "add_exercise": {
      const def = getExercise(op.exerciseId);
      if (!def) return null;
      if (findEx(w, op.exerciseId)) return null;
      return { workout: addExercise(w, op.exerciseId, { sets: op.sets, weight: op.weight, reps: op.reps, rationale: op.reason, rampFirst: true }), label: `${def.name} を追加` };
    }
    case "replace_exercise": {
      const e = findEx(w, op.from);
      const def = getExercise(op.to);
      if (!e || !def) return null;
      if (e.sets.some((s) => s.completed)) return null; // 実施済みは置換しない
      const idx = w.exercises.findIndex((x) => x.id === e.id);
      const lastW = e.sets[e.sets.length - 1]?.weight;
      const sameEquip = def.equipmentId === e.equipmentId;
      const w2 = addExercise(removeExercise(w, e.id), op.to, { sets: e.sets.length, weight: sameEquip ? lastW : undefined, rationale: op.reason, rampFirst: true }, idx);
      return { workout: w2, label: `${e.name} → ${def.name}` };
    }
    case "set_weight": {
      const e = findEx(w, op.exerciseId);
      if (!e) return null;
      let cur = w;
      for (const s of e.sets) {
        if (s.completed) continue;
        const patch = s.left || s.right ? { weight: op.weight, left: { ...s.left, weight: op.weight }, right: { ...s.right, weight: op.weight } } : { weight: op.weight };
        cur = updateSet(cur, e.id, s.id, patch);
      }
      return { workout: cur, label: `${e.name}：未実施セットを ${op.weight}kg に` };
    }
    case "set_reps": {
      const e = findEx(w, op.exerciseId);
      if (!e) return null;
      let cur = w;
      for (const s of e.sets) if (!s.completed) cur = updateSet(cur, e.id, s.id, { reps: op.reps });
      return { workout: cur, label: `${e.name}：目標 ${op.reps}回` };
    }
    case "set_sets": {
      const e = findEx(w, op.exerciseId);
      if (!e) return null;
      const target = Math.max(1, Math.min(8, op.sets));
      const done = e.sets.filter((s) => s.completed).length;
      if (target < done) return null; // 実績より少なくはできない
      let sets = [...e.sets];
      if (sets.length > target) {
        // 未完了セットを末尾から削る
        for (let i = sets.length - 1; i >= 0 && sets.length > target; i--) if (!sets[i].completed) sets.splice(i, 1);
      } else {
        const last = sets[sets.length - 1];
        while (sets.length < target) sets.push({ ...last, id: newId("set"), completed: false, excluded: false, actualReps: undefined, actualSeconds: undefined, feel: undefined, note: undefined, left: last?.left ? { weight: last.left.weight, reps: last.left.reps } : undefined, right: last?.right ? { weight: last.right.weight, reps: last.right.reps } : undefined });
      }
      sets = sets.map((s) => (s.completed ? s : { ...s, excluded: false }));
      return { workout: updateExercise(w, e.id, { sets }), label: `${e.name}：${target}セットに` };
    }
    case "set_cardio": {
      const idx = w.cardio.findIndex((c) => c.machine === op.machine && c.role === "main");
      const plan = op.segments.map((s) => ({ ...s, id: newId("seg") }));
      if (idx < 0) {
        return { workout: { ...w, cardio: [...w.cardio, { id: newId("cardio"), machine: op.machine, plan, completed: false, role: "main", rationale: op.reason }] }, label: `${op.machine === "treadmill" ? "トレッドミル" : "バイク"}の計画を追加` };
      }
      const c = w.cardio[idx];
      if (c.completed) return null;
      const cardio = w.cardio.map((x, i) => (i === idx ? { ...x, plan, rationale: op.reason ?? x.rationale, skipped: false } : x));
      return { workout: { ...w, cardio }, label: `${op.machine === "treadmill" ? "トレッドミル" : "バイク"}の計画を変更` };
    }
    case "remove_cardio": {
      const c = w.cardio.find((x) => x.machine === op.machine && !x.completed);
      if (!c) return null;
      return { workout: { ...w, cardio: w.cardio.map((x) => (x.id === c.id ? { ...x, skipped: true } : x)) }, label: `${op.machine === "treadmill" ? "トレッドミル" : "バイク"}を今日はやらない` };
    }
    case "reorder": {
      const map = new Map(w.exercises.map((e) => [e.exerciseId, e]));
      const ordered = op.exerciseIds.map((id) => map.get(id)).filter(Boolean) as Workout["exercises"];
      const rest = w.exercises.filter((e) => !op.exerciseIds.includes(e.exerciseId));
      return { workout: { ...w, exercises: [...ordered, ...rest] }, label: "順番を変更" };
    }
  }
}

export function describeOp(op: PlanPatchOp): string {
  switch (op.op) {
    case "remove_exercise":
      return `${op.exerciseId} の削除`;
    case "add_exercise":
      return `${op.exerciseId} の追加`;
    case "replace_exercise":
      return `${op.from}→${op.to}`;
    case "set_weight":
      return `${op.exerciseId} の重量`;
    case "set_sets":
      return `${op.exerciseId} のセット数`;
    case "set_reps":
      return `${op.exerciseId} の回数`;
    case "set_cardio":
      return `${op.machine} の計画`;
    case "remove_cardio":
      return `${op.machine} の削除`;
    case "reorder":
      return "並べ替え";
  }
}
