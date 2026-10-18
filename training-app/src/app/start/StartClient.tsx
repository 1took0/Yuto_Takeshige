"use client";
import { useSearchParams } from "next/navigation";
import { IntakeForm } from "@/components/workout/IntakeForm";

export function StartClient() {
  const sp = useSearchParams();
  return <IntakeForm presetMemo={sp.get("memo") ?? undefined} />;
}
