import { describe, expect, it } from "vitest";
import type { IntakeAnswers, StoreEquipment } from "@/lib/types";
import { allStores, defaultStoreId, setCustomStores, shortNameOf } from "@/lib/catalog/stores";
import { equipmentForNewStore } from "@/lib/catalog/storeEquipmentDefaults";
import { hiddenExercisesUsing, setDeletedExercises } from "@/lib/catalog/exercises";
import { availableExercises, generatePlan } from "./index";

/** LifeFit 以外のジム（追加した店舗）でのメニュー作成 */
const GYM = "custom-abc12345";
const intake: IntakeAnswers = { storeId: GYM, timeLimitMin: 60, condition: 4, soreness: false, soreRegions: [], pain: { present: false }, focus: "auto", cardio: "walk" };
const now = new Date("2026-10-18T10:00:00+09:00");
const plan = (equipment: StoreEquipment[], extra: Partial<IntakeAnswers> = {}) => generatePlan({ intake: { ...intake, ...extra }, history: [], storeEquipment: equipment, settings: { excludedExerciseIds: [] }, now });

/** 器具を「ある／ない」に確定した状態を作る */
function withEquipment(yes: string[], no: string[]): StoreEquipment[] {
  return equipmentForNewStore(GYM).map((r) => (yes.includes(r.equipmentId) ? { ...r, available: true, confirmed: true } : no.includes(r.equipmentId) ? { ...r, available: false, confirmed: true } : r));
}

describe("LifeFit 以外のジムを登録したとき", () => {
  it("店舗の既定は、追加した店舗が選べればそれ。表示しない標準店舗は選べない", () => {
    setCustomStores([{ id: GYM, name: "市営体育館トレーニング室", shortName: shortNameOf("市営体育館トレーニング室"), custom: true }], ["ichijoji", "higashiyama-nijo", "sanjo-ohashi"]);
    expect(allStores().map((s) => s.id)).toEqual([GYM]);
    expect(defaultStoreId(undefined)).toBe(GYM);
    expect(defaultStoreId("ichijoji")).toBe(GYM);
    expect(shortNameOf("市営体育館トレーニング室")).toBe("市営体育館トレー…");
    expect(shortNameOf("エニタイムフィットネス 四条店")).toBe("四条");
    setCustomStores([]);
    expect(defaultStoreId(undefined)).toBe("ichijoji");
  });

  it("追加直後（全部未確認）でもメニューが組め、注記は要約に1行だけ", () => {
    const { workout, summary } = plan(equipmentForNewStore(GYM));
    expect(workout.exercises.length).toBeGreaterThanOrEqual(5);
    expect(summary.some((s) => s.includes("まだ確認していない"))).toBe(true);
    expect(workout.exercises.every((e) => !(e.rationale ?? "").includes("未確認"))).toBe(true);
  });

  it("「ない」にしたトレッドミル・バイクは入らない", () => {
    const { workout, summary } = plan(withEquipment([], ["treadmill", "bike"]), { cardio: "run" });
    expect(workout.cardio).toHaveLength(0);
    expect(summary.some((s) => s.includes("トレッドミルが無いため"))).toBe(true);
    expect(summary.some((s) => s.includes("バイクが無いため"))).toBe(true);
  });

  it("マシンが無くパワーラック・ベンチ・ダンベルだけのジムでは、バーベルのBIG3が候補になる（器具を「ある」にすると隠れた種目が一覧に戻る）", () => {
    const machines = ["leg_press_machine", "leg_curl_machine", "leg_extension_machine", "abductor_machine", "adductor_machine", "chest_press_machine", "pec_fly_machine", "lat_pulldown_machine", "seated_row_machine", "shoulder_press_machine", "abdominal_machine", "biceps_curl_machine", "triceps_machine", "hip_thrust_machine", "back_extension", "assisted_chin", "plate_row_machine", "pulldown_trainer", "cable", "calf_raise_machine", "plate_chest_press", "converging_chest_press", "plate_shoulder_press", "plate_lat_pulldown", "plate_leg_press_45", "hack_squat_machine", "rotary_torso", "smith_machine", "ez_bar", "chin_dip_station", "leg_raise_station", "ab_bench", "preacher_bench", "bike", "treadmill"];
    const eq = withEquipment(["power_rack", "bench", "dumbbells", "mat"], machines);
    // 設定で「ある」にしたときに戻る種目（バーベルスクワット・デッドリフト・ロウなど）
    const hidden = hiddenExercisesUsing("power_rack").map((e) => e.id);
    expect(hidden).toEqual(expect.arrayContaining(["bb_squat", "bb_deadlift", "bb_row"]));
    setDeletedExercises([], [...hidden, ...hiddenExercisesUsing("dumbbells").map((e) => e.id)]);
    try {
      const { workout, warnings } = plan(eq, { timeLimitMin: null });
      const ids = workout.exercises.map((e) => e.exerciseId);
      expect(ids).toEqual(expect.arrayContaining(["bb_squat", "bb_bench_press"]));
      expect(ids.some((id) => ["bb_deadlift", "db_rdl"].includes(id))).toBe(true);
      expect(ids.some((id) => ["bb_row", "db_row"].includes(id))).toBe(true);
      expect(warnings.some((w) => w.includes("器具が少ない"))).toBe(false);
      // 種目一覧にも、この店舗で使える種目としてベンチプレスが出る
      expect(availableExercises(eq, GYM).map((a) => a.def.id)).toContain("bb_bench_press");
    } finally {
      setDeletedExercises([], []);
    }
  });

  it("器具がほとんど「ない」ジムでは、種目が組めないことを警告する", () => {
    const all = equipmentForNewStore(GYM).map((r) => r.equipmentId);
    const { warnings } = plan(withEquipment(["mat"], all.filter((id) => id !== "mat")));
    expect(warnings.some((w) => w.includes("器具が少ない"))).toBe(true);
  });
});
