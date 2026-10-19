import type { EquipmentDef } from "@/lib/types";

export const EQUIPMENT: EquipmentDef[] = [
  { id: "leg_press_machine", name: "レッグプレスマシン", category: "machine" },
  { id: "leg_curl_machine", name: "レッグカールマシン", category: "machine" },
  { id: "leg_extension_machine", name: "レッグエクステンションマシン", category: "machine" },
  { id: "abductor_machine", name: "アブダクターマシン", category: "machine" },
  { id: "adductor_machine", name: "アダクターマシン", category: "machine" },
  { id: "chest_press_machine", name: "チェストプレスマシン", category: "machine" },
  { id: "pec_fly_machine", name: "ペックフライマシン", category: "machine" },
  { id: "lat_pulldown_machine", name: "ラットプルダウンマシン", category: "machine" },
  { id: "seated_row_machine", name: "シーテッドロウマシン", category: "machine" },
  { id: "shoulder_press_machine", name: "ショルダープレスマシン", category: "machine" },
  { id: "abdominal_machine", name: "アブドミナルマシン", category: "machine" },
  { id: "biceps_curl_machine", name: "バイセップスカールマシン", category: "machine" },
  { id: "triceps_machine", name: "トライセプスマシン", category: "machine" },
  { id: "hip_thrust_machine", name: "グルート／ヒップスラストマシン", category: "machine" },
  { id: "back_extension", name: "バックエクステンション", category: "machine" },
  { id: "assisted_chin", name: "アシストチンニング", category: "machine" },
  { id: "plate_row_machine", name: "プレートローイング", category: "machine" },
  { id: "pulldown_trainer", name: "プルダウントレーナー", category: "machine" },
  { id: "cable", name: "ケーブルマシン", category: "machine" },
  { id: "calf_raise_machine", name: "カーフレイズマシン", category: "machine" },
  { id: "plate_chest_press", name: "プレートチェストプレス", category: "machine" },
  { id: "converging_chest_press", name: "コンバージングチェストプレス", category: "machine" },
  { id: "plate_shoulder_press", name: "プレートショルダープレス", category: "machine" },
  { id: "plate_lat_pulldown", name: "プレートラットプルダウン", category: "machine" },
  { id: "plate_leg_press_45", name: "プレートレッグプレス（45度）", category: "machine" },
  { id: "hack_squat_machine", name: "ハックスクワット", category: "machine" },
  { id: "rotary_torso", name: "ロータリートーソー", category: "machine" },
  { id: "smith_machine", name: "スミスマシン", category: "free" },
  { id: "power_rack", name: "パワーラック（バーベル）", category: "free" },
  { id: "ez_bar", name: "EZバー", category: "free" },
  { id: "chin_dip_station", name: "チンニング×ディップス", category: "bodyweight" },
  { id: "leg_raise_station", name: "レッグレイズ（チェア）", category: "bodyweight" },
  { id: "ab_bench", name: "アブベンチ", category: "bench" },
  { id: "dumbbells", name: "ダンベル", category: "free" },
  { id: "preacher_bench", name: "アームカールベンチ", category: "bench" },
  { id: "bench", name: "ベンチ", category: "bench" },
  { id: "mat", name: "マット（自重）", category: "bodyweight" },
  { id: "other", name: "その他の器具・マシン", category: "machine" },
  { id: "bike", name: "エアロバイク", category: "cardio" },
  { id: "treadmill", name: "トレッドミル", category: "cardio" },
];

export function equipmentName(id: string | undefined): string {
  if (!id) return "自重";
  return EQUIPMENT.find((e) => e.id === id)?.name ?? id;
}
