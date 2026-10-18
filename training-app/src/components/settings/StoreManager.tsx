"use client";
import { useState } from "react";
import { useStores } from "@/hooks/useSettings";
import { addStore, countWorkoutsAtStore, deleteStore, renameStore } from "@/lib/db/repo";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import type { StoreDef } from "@/lib/types";

/** 店舗の追加・名前変更・削除 */
export function StoreManager({ onAdded }: { onAdded?: (id: string) => void }) {
  const stores = useStores();
  const toast = useToast();
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ store: StoreDef; count: number } | null>(null);

  const add = async () => {
    try {
      const s = await addStore(name, copyFrom || undefined);
      setName("");
      setCopyFrom("");
      toast(`${s.name} を追加しました。器具は「未確認」なので、実際に確認して更新してください`, "success");
      onAdded?.(s.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "追加できませんでした", "error");
    }
  };

  return (
    <section id="stores" className="card space-y-3 p-3">
      <div>
        <h2 className="font-semibold">店舗</h2>
        <p className="text-xs text-muted">よく行く店舗を追加できます。追加した店舗は、トレーニング開始時の店舗の選択肢と器具の設定に表示されます。</p>
      </div>
      <ul className="divide-y divide-border" data-testid="store-list">
        {stores.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
            {editing?.id === s.id ? (
              <>
                <input className="input" maxLength={30} value={editing.name} onChange={(e) => setEditing({ id: s.id, name: e.target.value })} aria-label="店舗名" autoFocus />
                <button
                  type="button"
                  className="btn-primary shrink-0 px-3 py-1.5 text-sm"
                  disabled={!editing.name.trim()}
                  onClick={async () => {
                    await renameStore(s.id, editing.name);
                    setEditing(null);
                  }}
                >
                  保存
                </button>
                <button type="button" className="btn-ghost shrink-0 px-2 py-1.5 text-sm" onClick={() => setEditing(null)}>
                  取消
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">
                  {s.name}
                  {!s.custom && <span className="ml-1 text-[10px] text-muted">（標準）</span>}
                </span>
                {s.custom && (
                  <>
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({ id: s.id, name: s.name })}>
                      名前を変更
                    </button>
                    <button type="button" className="btn-ghost px-2 py-1 text-xs text-danger" onClick={async () => setRemoving({ store: s, count: await countWorkoutsAtStore(s.id) })}>
                      削除
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-xl bg-card-2 p-3">
        <div className="text-xs font-semibold text-muted">店舗を追加</div>
        <input className="input" maxLength={30} placeholder="例：LifeFit 〇〇店" value={name} onChange={(e) => setName(e.target.value)} aria-label="追加する店舗名" data-testid="store-name" />
        <label className="flex flex-col gap-1 text-xs text-muted">
          器具の初期値
          <select className="input py-1.5 text-sm" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="器具の初期値">
            <option value="">すべて未確認</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shortName}の器具をコピー
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary w-full" disabled={!name.trim()} onClick={add} data-testid="store-add">
          ＋ 追加
        </button>
      </div>
      <ConfirmDialog
        open={!!removing}
        title={`${removing?.store.name ?? ""} を削除しますか？`}
        message={removing?.count ? `この店舗の記録が ${removing.count} 件あります。記録は削除されず、店舗名も記録に残ります。器具の設定は削除されます。` : "器具の設定も削除されます。"}
        confirmLabel="削除"
        danger
        onConfirm={async () => {
          if (removing) await deleteStore(removing.store.id);
          toast("店舗を削除しました");
        }}
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}
