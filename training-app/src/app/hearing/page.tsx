import type { Metadata } from "next";
import { HearingClient } from "./HearingClient";

export const metadata: Metadata = { title: "はじめてのヒアリング" };

export default function HearingPage() {
  return <HearingClient />;
}
