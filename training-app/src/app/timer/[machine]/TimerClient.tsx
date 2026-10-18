"use client";
import { useParams, useSearchParams } from "next/navigation";
import { IntervalTimerView } from "@/components/timer/IntervalTimerView";
import type { TimerType } from "@/lib/timer/presets";

export function TimerClient() {
  const params = useParams<{ machine: string }>();
  const sp = useSearchParams();
  const m = params.machine;
  // 旧 URL（/timer/rest）はインターバルへ
  const machine: TimerType = m === "bike" || m === "treadmill" || m === "countdown" ? m : "interval";
  return <IntervalTimerView key={machine} machine={machine} entryId={sp.get("entry") ?? undefined} />;
}
