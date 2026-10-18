import type { Metadata } from "next";
import { Suspense } from "react";
import { TimerClient } from "./TimerClient";

export const metadata: Metadata = { title: "タイマー" };

export default function TimerPage() {
  return (
    <Suspense fallback={null}>
      <TimerClient />
    </Suspense>
  );
}
