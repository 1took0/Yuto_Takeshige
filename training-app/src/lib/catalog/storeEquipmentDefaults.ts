import type { BuiltinStoreId, StoreEquipment, StoreId } from "@/lib/types";
import { EQUIPMENT } from "./equipment";

/**
 * 店舗別の器具初期値
 * - confirmed: 実際の利用実績から確認済み
 * - 未確認の器具は available=true, confirmed=false として「未確認」表示し、
 *   ユーザーが「この器具はない」と指定すれば次回以降は除外される
 */
const CONFIRMED: Record<BuiltinStoreId, string[]> = {
  ichijoji: [
    "leg_press_machine",
    "leg_curl_machine",
    "abductor_machine",
    "chest_press_machine",
    "pec_fly_machine",
    "lat_pulldown_machine",
    "seated_row_machine",
    "shoulder_press_machine",
    "abdominal_machine",
    "biceps_curl_machine",
    "triceps_machine",
    "dumbbells",
    "mat",
    "bike",
    "treadmill",
    // LifeFit 公式の店舗ページのマシンリスト（2026-10-20 確認）
    "leg_extension_machine",
    "adductor_machine",
    "smith_machine",
    "power_rack",
    "bench",
    "ez_bar",
    "plate_chest_press",
    "plate_shoulder_press",
    "plate_lat_pulldown",
    "plate_row_machine",
    "rotary_torso",
    "chin_dip_station",
    "ab_bench",
  ],
  "higashiyama-nijo": [
    "leg_press_machine",
    "leg_curl_machine",
    "leg_extension_machine",
    "abductor_machine",
    "adductor_machine",
    "chest_press_machine",
    "pec_fly_machine",
    "lat_pulldown_machine",
    "seated_row_machine",
    "shoulder_press_machine",
    "abdominal_machine",
    "triceps_machine",
    "dumbbells",
    "preacher_bench",
    "mat",
    "bike",
    "treadmill",
  ],
  "sanjo-ohashi": [
    "pec_fly_machine",
    "assisted_chin",
    "plate_row_machine",
    "hip_thrust_machine",
    "back_extension",
    "pulldown_trainer",
    "abdominal_machine",
    // LifeFit 公式の店舗ページのマシンリスト（2026-10-20 確認）
    "leg_press_machine",
    "leg_curl_machine",
    "leg_extension_machine",
    "abductor_machine",
    "adductor_machine",
    "chest_press_machine",
    "lat_pulldown_machine",
    "shoulder_press_machine",
    "cable",
    "bike",
    "treadmill",
    "smith_machine",
    "power_rack",
    "bench",
    "ez_bar",
    "plate_chest_press",
    "converging_chest_press",
    "plate_shoulder_press",
    "plate_lat_pulldown",
    "plate_leg_press_45",
    "hack_squat_machine",
    "chin_dip_station",
    "leg_raise_station",
    "ab_bench",
  ],
};

/** 無いことが確認できている器具 */
const ABSENT: Record<BuiltinStoreId, string[]> = {
  ichijoji: [],
  "higashiyama-nijo": ["biceps_curl_machine"],
  "sanjo-ohashi": [],
};

/** 推測で確定しないが、計画対象として一覧に出す器具（未確認扱い） */
const UNCONFIRMED_CANDIDATES: Record<BuiltinStoreId, string[]> = {
  ichijoji: ["cable"],
  // 公式の店舗ページにマシンリストが無いため、LifeFit のほとんどの店舗にある器具を未確認で出す
  "higashiyama-nijo": ["cable", "bench", "smith_machine", "power_rack"],
  "sanjo-ohashi": ["seated_row_machine", "triceps_machine", "biceps_curl_machine", "dumbbells", "mat"],
};

export function defaultStoreEquipment(now = new Date().toISOString()): StoreEquipment[] {
  const rows: StoreEquipment[] = [];
  (Object.keys(CONFIRMED) as BuiltinStoreId[]).forEach((storeId) => {
    for (const equipmentId of CONFIRMED[storeId]) {
      rows.push({ key: `${storeId}:${equipmentId}`, storeId, equipmentId, available: true, confirmed: true, updatedAt: now });
    }
    for (const equipmentId of ABSENT[storeId]) {
      rows.push({
        key: `${storeId}:${equipmentId}`,
        storeId,
        equipmentId,
        available: false,
        confirmed: true,
        note: storeId === "higashiyama-nijo" ? "マシンが無いため片手ダンベルカールで代替" : undefined,
        updatedAt: now,
      });
    }
    for (const equipmentId of UNCONFIRMED_CANDIDATES[storeId]) {
      rows.push({ key: `${storeId}:${equipmentId}`, storeId, equipmentId, available: true, confirmed: false, updatedAt: now });
    }
  });
  return rows;
}

/**
 * 追加した店舗の器具の初期値
 * - コピー元が無ければ全器具を「未確認」（推測で確定しない）
 * - コピー元があれば、その店舗の「ある／ない」を引き継ぎ、すべて未確認扱いにする
 */
export function equipmentForNewStore(storeId: StoreId, copyFrom?: StoreEquipment[], now = new Date().toISOString()): StoreEquipment[] {
  // 「その他の器具」は自作種目の受け皿なので、店舗の器具としては扱わない
  return EQUIPMENT.filter((eq) => eq.id !== "other").map((eq) => {
    const src = copyFrom?.find((r) => r.equipmentId === eq.id);
    return {
      key: `${storeId}:${eq.id}`,
      storeId,
      equipmentId: eq.id,
      available: src ? src.available : true,
      confirmed: false,
      // コピー元の重量の刻みとメモは引き継ぐ
      stepKg: src?.stepKg,
      note: src?.note,
      updatedAt: now,
    };
  });
}
