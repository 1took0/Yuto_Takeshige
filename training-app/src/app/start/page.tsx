import type { Metadata } from "next";
import { Suspense } from "react";
import { StartClient } from "./StartClient";

export const metadata: Metadata = { title: "トレーニング開始" };

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartClient />
    </Suspense>
  );
}
