"use client";
import { useParams, useSearchParams } from "next/navigation";
import { WorkoutDetail } from "@/components/history/WorkoutDetail";

export function DetailClient() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  return <WorkoutDetail id={id} justSaved={sp.get("saved") === "1"} />;
}
