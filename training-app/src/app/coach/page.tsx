import type { Metadata } from "next";
import { CoachChat } from "@/components/coach/CoachChat";

export const metadata: Metadata = { title: "AIコーチ" };

export default function CoachPage() {
  return <CoachChat />;
}
