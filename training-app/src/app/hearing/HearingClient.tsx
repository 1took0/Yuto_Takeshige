"use client";
import { useRouter } from "next/navigation";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";

/** 初めて使う人の「はじめに」の次に表示するヒアリング（スキップ可） */
export function HearingClient() {
  const router = useRouter();
  return <PreferencesForm mode="first" onDone={() => router.replace("/")} />;
}
