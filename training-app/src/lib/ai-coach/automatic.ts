import type { AiCoachInput } from "./export";
import { buildAiCoachPrompt } from "./export";
import { BUILTIN_STORES } from "@/lib/catalog/stores";
import { defaultStoreEquipment } from "@/lib/catalog/storeEquipmentDefaults";

/** 直近20件の終了記録で最多の現存店舗。同数なら最新に使った店舗を優先する。 */
export function automaticCoachInput(input: Omit<AiCoachInput, "options">, trainingDate: string): AiCoachInput {
  const known = new Set(input.stores.filter((s) => !input.settings.hiddenStoreIds?.includes(s.id)).map((s) => s.id));
  const recent = input.workouts.filter((w) => w.status === "completed" && w.trainingDate <= trainingDate)
    .slice().sort((a, b) => b.trainingDate.localeCompare(a.trainingDate) || b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
  const counts = new Map<string, number>();
  for (const w of recent) if (known.has(w.storeId)) counts.set(w.storeId, (counts.get(w.storeId) ?? 0) + 1);
  const storeId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "ichijoji";
  const preset = counts.size === 0;
  const stores = input.stores.some((s) => s.id === "ichijoji") ? input.stores : [...input.stores, BUILTIN_STORES[0]];
  // 店舗の実績がない場合は本人の利用店舗と断定せず、標準器具の仮プリセットを渡す。
  const equipment = preset ? defaultStoreEquipment().filter((e) => e.storeId === "ichijoji") : input.equipment;
  return { ...input, stores, equipment, options: {
    historyCount: 20, storeId, trainingDate, request: "", includeHealth: false, includeNotes: false, includeStoreNames: false,
    referenceReason: preset ? "利用記録から現在使える店舗を選べないため、LifeFit一乗寺店の器具プリセットを仮に使用。本人の利用実績や器具の確認済み情報ではありません。AIの会話で使う店舗と器具を確認してください。"
      : "直近20件までの終了済み記録で最も多く使った現在選択可能な店舗。同数の場合は最後に使った店舗。今後も主に使うかはAIの会話で確認してください。",
  } };
}

export function buildAutomaticCoachPrompt(input: Omit<AiCoachInput, "options">, trainingDate: string) {
  return buildAiCoachPrompt(automaticCoachInput(input, trainingDate));
}
