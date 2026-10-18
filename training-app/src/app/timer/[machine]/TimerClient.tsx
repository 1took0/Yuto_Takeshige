"use client";
import { useParams, useSearchParams } from "next/navigation";
import { IntervalTimerView } from "@/components/timer/IntervalTimerView";

export function TimerClient() {
  const params = useParams<{ machine: string }>();
  const sp = useSearchParams();
  const machine = params.machine === "bike" || params.machine === "treadmill" ? params.machine : "rest";
  return <IntervalTimerView machine={machine} entryId={sp.get("entry") ?? undefined} />;
}
