import type { Metadata } from "next";
import { PreferencesClient } from "./PreferencesClient";

export const metadata: Metadata = { title: "メニューの希望" };

export default function PreferencesPage() {
  return <PreferencesClient />;
}
