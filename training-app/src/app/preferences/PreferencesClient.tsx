"use client";
import { useRouter } from "next/navigation";
import { PreferencesForm } from "@/components/preferences/PreferencesForm";
import { useToast } from "@/components/ui/Toast";

export function PreferencesClient() {
  const router = useRouter();
  const toast = useToast();
  return (
    <PreferencesForm
      mode="edit"
      onCancel={() => router.push("/settings")}
      onDone={() => {
        toast("保存しました。次のメニュー作成から反映します");
        router.push("/settings");
      }}
    />
  );
}
