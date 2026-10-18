import type { Metadata } from "next";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "はじめに" };

export default function WelcomePage() {
  return <WelcomeForm />;
}
