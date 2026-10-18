"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useSettings } from "@/hooks/useSettings";
import { db } from "@/lib/db";
import { listAllWorkouts, listStoreEquipment, setStoreEquipment, wipeAll, ensureSeeded, importSeedHistory, bulkPutWorkouts, getSettings } from "@/lib/db/repo";
import { GoalsEditor } from "./GoalsEditor";
import { ShareSettings } from "./ShareSettings";
import { goalsOrDefault } from "@/lib/goals";
import { StoreManager } from "./StoreManager";
import { useStores } from "@/hooks/useSettings";
import { EQUIPMENT } from "@/lib/catalog/equipment";
import { EXERCISES } from "@/lib/catalog/exercises";
import type { StoreId } from "@/lib/types";
import { cardioToCSV, downloadText, parseImport, setsToCSV, toJSON } from "@/lib/export";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { disableSharing } from "@/lib/share/client";
import { musclesLabel } from "@/lib/catalog/muscles";

export function SettingsView() {
  const { settings, update } = useSettings();
  const router = useRouter();
  const [storeSel, setStore] = useState<StoreId>("ichijoji");
  const stores = useStores();
  const store = stores.some((s) => s.id === storeSel) ? storeSel : "ichijoji";
  const equipment = useLiveQuery(() => listStoreEquipment(store), [store], []);
  const workouts = useLiveQuery(() => listAllWorkouts(), [], []);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [importPreview, setImportPreview] = useState<{ count: number; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const rows = EQUIPMENT.map((eq) => ({ eq, row: equipment.find((r) => r.equipmentId === eq.id) })).sort((a, b) => Number(!!b.row) - Number(!!a.row));

  const exportJSON = async () => {
    const [ws, se] = await Promise.all([listAllWorkouts(), listStoreEquipment()]);
    downloadText(`training-coach-${new Date().toISOString().slice(0, 10)}.json`, toJSON(ws, se), "application/json");
  };
  const exportCSV = async () => {
    const ws = await listAllWorkouts();
    downloadText(`training-sets-${new Date().toISOString().slice(0, 10)}.csv`, setsToCSV(ws), "text/csv");
    downloadText(`training-cardio-${new Date().toISOString().slice(0, 10)}.csv`, cardioToCSV(ws), "text/csv");
  };
  const onImportFile = async (f: File) => {
    try {
      const text = await f.text();
      const bundle = parseImport(text);
      setImportPreview({ count: bundle.workouts.length, text });
    } catch (e) {
      toast(e instanceof Error ? e.message : "読み込みに失敗しました", "error");
    }
  };
  const doImport = async () => {
    if (!importPreview) return;
    const bundle = parseImport(importPreview.text);
    await bulkPutWorkouts(bundle.workouts);
    if (bundle.storeEquipment?.length) await db().storeEquipment.bulkPut(bundle.storeEquipment);
    toast(`${bundle.workouts.length}件を取り込みました（同じIDは上書き）`, "success");
    setImportPreview(null);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">設定</h1>

      <ShareSettings />

      <Section title="表示">
        <div className="flex gap-2">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} type="button" className="chip" data-selected={settings.theme === t} onClick={() => update({ theme: t })}>
              {t === "system" ? "端末に合わせる" : t === "light" ? "ライト" : "ダーク"}
            </button>
          ))}
        </div>
      </Section>

      <Section title="タイマー">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} /> 区間切替の音
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.vibration} onChange={(e) => update({ vibration: e.target.checked })} /> 振動（対応端末のみ）
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} /> タイマー中は画面を消灯しない
          </label>
        </div>
      </Section>

      <StoreManager onAdded={(id) => setStore(id)} />

      <Section title="店舗の器具" hint="「ない」にすると次回以降のメニューから自動的に除外されます。未確認は推測なので、実際に確認したら更新してください。">
        <div className="mb-2 flex flex-wrap gap-1">
          {stores.map((s) => (
            <button key={s.id} type="button" className="chip flex-1 whitespace-nowrap" data-selected={store === s.id} onClick={() => setStore(s.id)}>
              {s.shortName}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {rows.map(({ eq, row }) => {
            const state: "yes" | "no" | "unknown" = !row ? "unknown" : row.available ? (row.confirmed ? "yes" : "unknown") : "no";
            return (
              <li key={eq.id} className="flex items-center gap-2 py-2 text-sm" data-testid="equipment-row">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{eq.name}</div>
                  {row?.note && <div className="text-xs text-muted">{row.note}</div>}
                </div>
                <div className="flex gap-1" role="radiogroup" aria-label={`${eq.name}の有無`}>
                  <button type="button" role="radio" aria-checked={state === "yes"} className="chip min-h-9 px-3 py-1 text-xs" data-selected={state === "yes"} onClick={() => setStoreEquipment(store, eq.id, { available: true, confirmed: true })}>
                    ある
                  </button>
                  <button type="button" role="radio" aria-checked={state === "unknown"} className="chip min-h-9 px-3 py-1 text-xs" data-selected={state === "unknown"} onClick={() => setStoreEquipment(store, eq.id, { available: true, confirmed: false })}>
                    未確認
                  </button>
                  <button type="button" role="radio" aria-checked={state === "no"} className="chip min-h-9 px-3 py-1 text-xs" data-selected={state === "no"} onClick={() => setStoreEquipment(store, eq.id, { available: false, confirmed: true })}>
                    ない
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="自動メニューから除外する種目" hint="チェックした種目は自動作成に含めません（手動追加は可能）。バードドッグは最初から含まれていません。">
        <ul className="grid grid-cols-1 gap-1 text-sm">
          {EXERCISES.map((e) => {
            const checked = settings.excludedExerciseIds.includes(e.id);
            return (
              <li key={e.id}>
                <label className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(ev) => update({ excludedExerciseIds: ev.target.checked ? [...settings.excludedExerciseIds, e.id] : settings.excludedExerciseIds.filter((x) => x !== e.id) })}
                  />
                  <span className={checked ? "line-through text-muted" : ""}>{e.name}</span>
                  <span className="text-xs text-muted">{musclesLabel(e.primary)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="目標（メニュー作成の前提）" hint="変更は次のメニュー作成から反映されます。">
        <GoalsEditor value={goalsOrDefault(settings.goals)} onChange={(g) => update({ goals: g })} />
      </Section>

      <Section title="アクセス保護" hint="サーバーに APP_PASSWORD を設定している場合、この端末のログイン状態を解除できます。">
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          onClick={async () => {
            const r = await fetch("/api/login");
            const j = await r.json().catch(() => ({ enabled: false }));
            if (!j.enabled) {
              toast("パスワード保護は無効です（APP_PASSWORD 未設定）");
              return;
            }
            await fetch("/api/login", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
        >
          この端末でログアウト
        </button>
      </Section>


      <Section title="データ" hint={`記録 ${workouts.length} 件（この端末の IndexedDB に保存）。機種変更時は JSON でエクスポート → 新しい端末でインポートしてください。`}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={exportJSON}>
            JSON エクスポート
          </button>
          <button type="button" className="btn-secondary" onClick={exportCSV}>
            CSV エクスポート
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            JSON インポート
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])} />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setConfirmSeed(true)}
          >
            作成者の履歴を取り込む
          </button>
          <button type="button" className="btn-danger col-span-2" onClick={() => setConfirmWipe(true)}>
            すべてのデータを削除
          </button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmSeed}
        title="作成者の過去の記録を取り込みますか？"
        message="2026/9/20〜10/16 の12回分です。アプリ作成者本人以外は取り込まないでください。"
        confirmLabel="取り込む"
        onConfirm={async () => {
          const n = await importSeedHistory();
          toast(n ? `${n}件を取り込みました` : "すでに取り込み済みです");
        }}
        onClose={() => setConfirmSeed(false)}
      />
      <ConfirmDialog open={!!importPreview} title={`${importPreview?.count ?? 0}件の記録を取り込みますか？`} message="同じIDの記録は上書きされます。" confirmLabel="取り込む" onConfirm={doImport} onClose={() => setImportPreview(null)} />
      <ConfirmDialog
        open={confirmWipe}
        title="すべてのデータを削除しますか？"
        message="この端末の履歴・設定・器具情報がすべて消え、初回設定からやり直します。先に JSON エクスポートを推奨します。共有中の記録はサーバーからも削除されます。"
        confirmLabel="削除する"
        danger
        onConfirm={async () => {
          const s = await getSettings();
          if (s.sharing) await disableSharing().catch(() => {});
          await wipeAll();
          await ensureSeeded();
          toast("削除しました");
          router.replace("/welcome");
        }}
        onClose={() => setConfirmWipe(false)}
      />
      <p className="pb-4 text-center text-[11px] text-muted">トレーニングコーチ v0.1 ・ 1日の区切りは午前6時（Asia/Tokyo）</p>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-3">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}
