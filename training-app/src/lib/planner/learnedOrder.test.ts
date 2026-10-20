import { describe, expect, it } from "vitest";
import type { IntakeAnswers, Workout } from "@/lib/types";
import { addCardio, addExercise, finalizeWorkout, moveItemTo, newManualWorkout, orderedItems, toggleSetCompleted } from "@/lib/workout/edit";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";
import { DEFAULT_GOALS } from "@/lib/goals";
import { generatePlan } from "./index";
import { equipmentGroupOf, isManualWorkout, trainingHabits } from "./habits";

const equipment = defaultStoreEquipment();
const intake: IntakeAnswers = { storeId: "ichijoji", timeLimitMin: 90, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };
const now = new Date("2026-10-18T10:00:00+09:00");

/**
 * 自動作成のメニューを行った記録（自分で入力したメニューではない）
 * ids の順にセットを終え、treadmillFirst ならトレッドミルを最初に行う
 */
function autoSession(date: string, ids: string[], opts: { treadmillFirst?: boolean } = {}): Workout {
  let w = newManualWorkout("ichijoji", "LifeFit 一乗寺店", new Date(`${date}T19:00:00+09:00`));
  // 表示上は逆の順に並べておき、実際にセットを終えた順（ids の順）を学ぶことを確かめる
  for (const id of [...ids].reverse()) w = addExercise(w, id, { sets: 2, weight: 20 });
  w = addCardio(w, "treadmill");
  w = { ...w, cardio: w.cardio.map((c) => ({ ...c, completed: true })) };
  if (opts.treadmillFirst) w = moveItemTo(w, w.cardio[0].id, 0);
  let t = Date.parse(`${date}T19:10:00+09:00`);
  for (const id of ids) {
    const e = w.exercises.find((x) => x.exerciseId === id)!;
    for (const s of e.sets) {
      w = toggleSetCompleted(w, e.id, s.id);
      const at = new Date((t += 60_000)).toISOString();
      w = { ...w, exercises: w.exercises.map((x) => (x.id === e.id ? { ...x, sets: x.sets.map((y) => (y.id === s.id ? { ...y, completedAt: at } : y)) } : x)) };
    }
  }
  return { ...finalizeWorkout(w, `${date}T20:00:00+09:00`), manual: false, intake };
}

describe("これまでの記録から順番を学ぶ", () => {
  const ids = ["db_curl_single", "db_hammer_curl_single", "abdominal", "chest_press", "leg_press"];
  const history = ["2026-10-10", "2026-10-13", "2026-10-16"].map((d) => autoSession(d, ids, { treadmillFirst: true }));

  it("自動作成のメニューの記録からも、実際に行った順番と有酸素の位置を読み取る", () => {
    expect(isManualWorkout(history[0])).toBe(false);
    const h = trainingHabits(history, "2026-10-18");
    expect(h.count).toBe(3);
    expect(h.position.get("db_curl_single")!).toBeLessThan(h.position.get("leg_press")!);
    expect(h.groupPosition.get("dumbbell")!).toBeLessThan(h.groupPosition.get("machine")!);
    expect(h.cardioPosition.get("treadmill")!.pos).toBe(0);
  });

  it("有酸素を最初に行う人には、トレッドミルを筋トレの前に置く", () => {
    const { workout, summary } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    const first = orderedItems(workout)[0];
    expect(first.kind).toBe("cardio");
    expect(workout.cardio.find((c) => c.id === first.id)!.machine).toBe("treadmill");
    expect(summary.some((s) => s.includes("トレッドミルを筋トレの前"))).toBe(true);
  });

  it("ダンベル→マシンの順で行う人には、行ったことのないダンベル種目もマシンより前に置く", () => {
    const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: [], goals: { ...DEFAULT_GOALS, preferDumbbell: true } }, now });
    const order = workout.exercises.map((e) => e.exerciseId);
    const newDb = order.find((id) => id.startsWith("db_") && !ids.includes(id));
    expect(newDb).toBeDefined();
    // ダンベル種目はすべて、マシン種目より前
    const lastDb = Math.max(...order.map((id, i) => (equipmentGroupOf(id) === "dumbbell" ? i : -1)));
    const firstMachine = order.findIndex((id) => equipmentGroupOf(id) === "machine");
    expect(firstMachine).toBeGreaterThan(-1);
    expect(lastDb).toBeLessThan(firstMachine);
  });

  it("記録が無ければ、これまでどおりバイク→筋トレ→トレッドミル", () => {
    const { workout } = generatePlan({ intake, history: [], storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });
    const items = orderedItems(workout);
    expect(workout.cardio.find((c) => c.id === items[0].id)?.machine).toBe("bike");
    expect(workout.cardio.find((c) => c.id === items.at(-1)!.id)?.machine).toBe("treadmill");
  });
});
