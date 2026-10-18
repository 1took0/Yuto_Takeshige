import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";

export const metadata: Metadata = { title: "分析" };

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
