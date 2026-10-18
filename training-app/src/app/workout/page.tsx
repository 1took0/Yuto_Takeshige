import type { Metadata } from "next";
import { ActiveWorkoutView } from "@/components/workout/ActiveWorkoutView";

export const metadata: Metadata = { title: "トレーニング" };

export default function WorkoutPage() {
  return <ActiveWorkoutView />;
}
