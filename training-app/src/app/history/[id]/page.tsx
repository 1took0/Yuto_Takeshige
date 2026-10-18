import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailClient } from "./DetailClient";

export const metadata: Metadata = { title: "トレーニング詳細" };

export default function HistoryDetailPage() {
  return (
    <Suspense fallback={null}>
      <DetailClient />
    </Suspense>
  );
}
