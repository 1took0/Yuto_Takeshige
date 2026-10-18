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
