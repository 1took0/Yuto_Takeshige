import type { Metadata } from "next";
import { CoachPresets } from "@/components/coach/CoachPresets";

export const metadata: Metadata = { title: "コーチ" };

export default function CoachPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">コーチに相談</h1>
      <p className="text-sm text-muted">あてはまるものを選ぶと、今日のメニューや今後のメニューに反映します。提案は「予定」にだけ反映され、完了したセットや実績は変わりません。</p>
      <CoachPresets />
    </div>
  );
}
