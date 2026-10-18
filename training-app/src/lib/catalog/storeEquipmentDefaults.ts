import type { StoreEquipment, StoreId } from "@/lib/types";

/**
 * 店舗別の器具初期値
 * - confirmed: 実際の利用実績から確認済み
 * - 未確認の器具は available=true, confirmed=false として「未確認」表示し、
 *   ユーザーが「この器具はない」と指定すれば次回以降は除外される
 */
const CONFIRMED: Record<StoreId, string[]> = {
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
  ],
};

/** 無いことが確認できている器具 */
const ABSENT: Record<StoreId, string[]> = {
  ichijoji: [],
  "higashiyama-nijo": ["biceps_curl_machine"],
  "sanjo-ohashi": [],
};

/** 推測で確定しないが、計画対象として一覧に出す器具（未確認扱い） */
const UNCONFIRMED_CANDIDATES: Record<StoreId, string[]> = {
  ichijoji: ["leg_extension_machine", "adductor_machine", "cable", "bench"],
  "higashiyama-nijo": ["cable", "bench"],
  "sanjo-ohashi": [
    "leg_press_machine",
    "leg_curl_machine",
    "leg_extension_machine",
    "abductor_machine",
    "adductor_machine",
    "chest_press_machine",
    "lat_pulldown_machine",
    "seated_row_machine",
    "shoulder_press_machine",
    "triceps_machine",
    "biceps_curl_machine",
    "dumbbells",
    "mat",
    "bike",
    "treadmill",
    "cable",
  ],
};

export function defaultStoreEquipment(now = new Date().toISOString()): StoreEquipment[] {
  const rows: StoreEquipment[] = [];
  (Object.keys(CONFIRMED) as StoreId[]).forEach((storeId) => {
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
