"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useSettings } from "@/hooks/useSettings";
import { db } from "@/lib/db";
import { listAllWorkouts, listStoreEquipment, setStoreEquipment, wipeAll, ensureSeeded, updateSettings } from "@/lib/db/repo";
import { STORES } from "@/lib/catalog/stores";
import { EQUIPMENT } from "@/lib/catalog/equipment";
import { EXERCISES } from "@/lib/catalog/exercises";
import type { StoreId } from "@/lib/types";
import { cardioToCSV, downloadText, parseImport, setsToCSV, toJSON } from "@/lib/export";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { musclesLabel } from "@/lib/catalog/muscles";

export function SettingsView() {
  const { settings, update } = useSettings();
  const router = useRouter();
  const [store, setStore] = useState<StoreId>("ichijoji");
  const equipment = useLiveQuery(() => listStoreEquipment(store), [store], []);
  const workouts = useLiveQuery(() => listAllWorkouts(), [], []);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [importPreview, setImportPreview] = useState<{ count: number; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [aiStatus, setAiStatus] = useState<string | null>(null);

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
    await db().workouts.bulkPut(bundle.workouts);
    if (bundle.storeEquipment?.length) await db().storeEquipment.bulkPut(bundle.storeEquipment);
    toast(`${bundle.workouts.length}件を取り込みました（同じIDは上書き）`, "success");
    setImportPreview(null);
  };
  const checkAI = async () => {
    try {
      const r = await fetch("/api/coach");
      const j = await r.json();
      setAiStatus(j.enabled ? `有効（${j.model}）` : "未設定（ルールベースで動作）");
    } catch {
      setAiStatus("確認できませんでした");
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">設定</h1>

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

      <Section title="店舗の器具" hint="「ない」にすると次回以降のメニューから自動的に除外されます。未確認は推測なので、実際に確認したら更新してください。">
        <div className="mb-2 flex gap-1">
          {STORES.map((s) => (
            <button key={s.id} type="button" className="chip flex-1" data-selected={store === s.id} onClick={() => setStore(s.id)}>
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

      <Section title="目標（メニュー作成の前提）">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>重点：下半身・胸・背中・腹筋・体幹（全身をバランスよく）</li>
          <li>お尻の強化、腰まわりの安定性と腰痛対策、体脂肪の減少</li>
          <li>上腕二頭筋・三頭筋の強化、左手の握力・前腕の左右差改善</li>
          <li>ランニング能力・心肺機能の向上（連続走行時間を段階的に延長）</li>
          <li>片手ダンベルハンマーカールを定期的に組み込む</li>
        </ul>
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

      <Section title="AIコーチ（Claude API）" hint="API キーはサーバーの環境変数 ANTHROPIC_API_KEY にのみ設定します。ブラウザには送られません。未設定でも履歴・進捗・タイマー・ルールベースのメニュー作成は動作します。">
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={checkAI}>
            接続状態を確認
          </button>
          <span className="text-muted">{aiStatus ?? ""}</span>
        </div>
      </Section>

      <Section title="データ" hint={`記録 ${workouts.length} 件（この端末の IndexedDB に保存）。将来のクラウド同期に備えて JSON で全件エクスポートできます。`}>
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
            onClick={async () => {
              await updateSettings({ seedVersion: 0 });
              const r = await ensureSeeded();
              toast(r.seeded ? "初期履歴を再投入しました" : "初期履歴はすでに存在します");
            }}
          >
            初期履歴を再投入
          </button>
          <button type="button" className="btn-danger col-span-2" onClick={() => setConfirmWipe(true)}>
            すべてのデータを削除
          </button>
        </div>
      </Section>

      <ConfirmDialog open={!!importPreview} title={`${importPreview?.count ?? 0}件の記録を取り込みますか？`} message="同じIDの記録は上書きされます。" confirmLabel="取り込む" onConfirm={doImport} onClose={() => setImportPreview(null)} />
      <ConfirmDialog
        open={confirmWipe}
        title="すべてのデータを削除しますか？"
        message="履歴・設定・器具情報がすべて消えます。先に JSON エクスポートを推奨します。初期履歴は次回起動時に再投入されます。"
        confirmLabel="削除する"
        danger
        onConfirm={async () => {
          await wipeAll();
          await ensureSeeded();
          toast("削除しました");
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
