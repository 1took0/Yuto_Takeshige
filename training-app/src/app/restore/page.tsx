import type { Metadata } from "next";
import { Suspense } from "react";
import { RestoreForm } from "./RestoreForm";

export const metadata: Metadata = { title: "記録の復元", robots: { index: false } };

export default function RestorePage() {
  return (
    <Suspense fallback={null}>
      <RestoreForm />
    </Suspense>
  );
}
