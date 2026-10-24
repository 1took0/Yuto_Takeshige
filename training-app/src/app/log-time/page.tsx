import type { Metadata } from "next";
import { TimeOnlyForm } from "@/components/workout/TimeOnlyForm";

export const metadata: Metadata = { title: "時間だけ記録" };

export default function LogTimePage() {
  return <TimeOnlyForm />;
}
