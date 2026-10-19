"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StoreId } from "@/lib/types";
import { ChipGroup } from "@/components/ui/Chips";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useStores } from "@/hooks/useSettings";
import { getSettings, updateSettings } from "@/lib/db/repo";
import { storeName } from "@/lib/catalog/stores";
import { newManualWorkout } from "@/lib/workout/edit";
import { useActiveWorkout } from "./ActiveWorkoutProvider";

/** メニューを自動作成せず、自分で種目を入力して記録する */
export function ManualStartForm() {
  const router = useRouter();
  const stores = useStores();
  const { workout: active, setWorkout } = useActiveWorkout();
  const [storeId, setStoreId] = useState<StoreId | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (!cancelled) setStoreId(s.lastStoreId ?? "ichijoji");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 前回の店舗が削除されていれば先頭の店舗にする
  const validStore = storeId && stores.some((s) => s.id === storeId) ? storeId : (stores[0]?.id ?? storeId);

  const create = async () => {
    if (!validStore) return;
    setBusy(true);
    try {
      if (active) {
        const { deleteWorkout } = await import("@/lib/db/repo");
        await deleteWorkout(active.id);
      }
      await setWorkout(newManualWorkout(validStore, storeName(validStore)));
      await updateSettings({ lastStoreId: validStore });
      router.push("/workout");
    } finally {
      setBusy(false);
    }
  };

  if (!storeId || !validStore) return <p className="py-10 text-center text-muted">読み込み中…</p>;

  return (
    <div className="space-y-5 pb-28">
      <header className="flex items-center gap-2">
        <button type="button" className="btn-ghost -ml-3 px-3" onClick={() => router.back()} aria-label="戻る">
          ←
        </button>
        <h1 className="text-2xl font-bold">自分でメニューを入力</h1>
      </header>
      <p className="text-sm text-muted">空のトレーニングから始めて、「＋ 種目を追加」「＋ 有酸素を追加」で自由に組み立てて記録できます。過去の日付の記録は、保存後に履歴の「編集」で日付を変えられます。</p>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">店舗</h2>
        <ChipGroup label="店舗" options={stores.map((s) => ({ value: s.id, label: s.shortName }))} value={validStore} onChange={setStoreId} columns={3} />
        <Link href="/settings#stores" className="mt-2 inline-block text-xs text-accent">＋ 店舗を追加・編集</Link>
      </section>

      <Link href="/start" className="block text-center text-sm text-accent">
        メニューを自動で作ってもらう →
      </Link>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg bg-bg/95 px-4 pt-2 safe-bottom backdrop-blur">
        <button type="button" className="btn-primary w-full py-4 text-lg" disabled={busy} onClick={() => (active ? setConfirmReplace(true) : create())} data-testid="manual-create">
          {busy ? "準備中…" : "入力を始める"}
        </button>
      </div>
      <ConfirmDialog
        open={confirmReplace}
        title="進行中のトレーニングがあります"
        message="新しく始めると、進行中の記録は破棄されます。先に保存する場合はトレーニング画面から終了してください。"
        confirmLabel="破棄して始める"
        danger
        onConfirm={create}
        onClose={() => setConfirmReplace(false)}
      />
    </div>
  );
}
