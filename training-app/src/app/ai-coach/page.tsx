import type { Metadata } from "next";
import { AiCoachExport } from "@/components/ai-coach/AiCoachExport";

export const metadata: Metadata = { title: "AIにメニューを相談" };

export default function AiCoachPage() {
  return <AiCoachExport />;
}
