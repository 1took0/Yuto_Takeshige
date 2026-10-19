import type { Metadata } from "next";
import { PreferencesClient } from "./PreferencesClient";

export const metadata: Metadata = { title: "ヒアリング結果の編集" };

export default function PreferencesPage() {
  return <PreferencesClient />;
}
