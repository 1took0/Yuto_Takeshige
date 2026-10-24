"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useSettings } from "@/hooks/useSettings";
import { db } from "@/lib/db";
import { listAllWorkouts, listStoreEquipment, setStoreEquipment, wipeAll, ensureSeeded, bulkPutWorkouts, getSettings } from "@/lib/db/repo";
import { GoalsEditor } from "./GoalsEditor";
import { ShareSettings } from "./ShareSettings";
import { goalsOrDefault } from "@/lib/goals";
import { StoreManager } from "./StoreManager";
import { useExercises, useStores } from "@/hooks/useSettings";
import { EQUIPMENT } from "@/lib/catalog/equipment";
import { CustomExerciseManager } from "./CustomExerciseManager";
import type { Goals, MenuPreferences, StoreId } from "@/lib/types";
import { CARDIO_CHOICE_LABEL, EQUIPMENT_STYLE_LABEL, EXPERIENCE_LABEL, INTENSITY_LABEL } from "@/lib/preferences";
import { REGION_LABEL } from "@/lib/catalog/muscles";
import { exerciseName } from "@/lib/catalog/exercises";
import { cardioToCSV, downloadText, parseImport, setsToCSV, toJSON } from "@/lib/export";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { disableSharing } from "@/lib/share/client";
import { musclesLabel } from "@/lib/catalog/muscles";
import { ChipGroup } from "@/components/ui/Chips";
import { defaultStepOf } from "@/lib/planner/progression";
import { Collapsible } from "@/components/ui/Collapsible";
import { defaultStoreId, isBuiltinStore } from "@/lib/catalog/stores";
import { hiddenExercisesUsing } from "@/lib/catalog/exercises";
import { restoreExercise } from "@/lib/db/repo";
import { NumberField } from "@/components/ui/NumberField";

export function SettingsView() {
  const { settings, update } = useSettings();
  const router = useRouter();
  const [storeSel, setStore] = useState<StoreId | null>(null);
  const stores = useStores();
  const allEx = useExercises();
  const defaultStep = defaultSteps(allEx);
  // 最初は前回使った店舗（LifeFit を使わない人は追加した店舗）
  const store = storeSel && stores.some((s) => s.id === storeSel) ? storeSel : defaultStoreId(settings.lastStoreId);
  const equipment = useLiveQuery(() => listStoreEquipment(store), [store], []);
  const workouts = useLiveQuery(() => listAllWorkouts(), [], []);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [goalsDraft, setGoalsDraft] = useState<Goals | null>(null);
  const [importPreview, setImportPreview] = useState<{ count: number; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // 「その他の器具」は自作種目の受け皿なので店舗の器具には出さない
  const rows = EQUIPMENT.filter((eq) => eq.id !== "other").map((eq) => ({ eq, row: equipment.find((r) => r.equipmentId === eq.id) })).sort((a, b) => Number(!!b.row) - Number(!!a.row));
  /** 器具を「ある」にする。追加した店舗では、その器具を使う隠れた標準種目も一覧に加える */
  const markAvailable = async (equipmentId: string) => {
    await setStoreEquipment(store, equipmentId, { available: true, confirmed: true });
    if (isBuiltinStore(store)) return;
    const hidden = hiddenExercisesUsing(equipmentId);
    for (const e of hidden) await restoreExercise(e.id);
    if (hidden.length) toast(`${hidden.map((e) => e.name).join("・")}を種目一覧に加えました`, "success");
  };
  // 一括変更の途中で1つの器具を変えると上書きされるので、まとめて書き込み、その間はボタンを押せなくする
  const [bulkBusy, setBulkBusy] = useState(false);
  const setAll = async (available: boolean) => {
    setBulkBusy(true);
    try {
      await Promise.all(rows.map(({ eq }) => setStoreEquipment(store, eq.id, { available, confirmed: true })));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportJSON = async () => {
    const [ws, se] = await Promise.all([listAllWorkouts(), listStoreEquipment()]);
    downloadText(`training-coach-${new Date().toISOString().slice(0, 10)}.json`, toJSON(ws, se, settings.customStores ?? []), "application/json");
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
    // 追加した店舗は、無いものだけ加える（同じ id はそのまま）
    if (bundle.customStores?.length) {
      const cur = settings.customStores ?? [];
      const add = bundle.customStores.filter((s) => !cur.some((x) => x.id === s.id));
      if (add.length) await update({ customStores: [...cur, ...add] });
    }
    toast(`${bundle.workouts.length}件を取り込みました（同じIDは上書き）`, "success");
    setImportPreview(null);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">設定</h1>
      <p className="text-xs text-muted">項目を押すと開きます。</p>

      <ShareSettings />

      <Link href="/ai-coach" className="btn-secondary w-full">AIにメニューを相談（記録を書き出す）</Link>

      <Section id="preferences" title="ヒアリング結果（メニューの希望）" hint="最初のトレーニングで答えた内容です。変更は次のメニュー作成から反映されます。トレーニング中にコーチの「今後この種目は外したい」を選んでも更新されます。">
        <PreferencesSummary goals={goalsOrDefault(settings.goals)} prefs={settings.preferences ?? {}} />
        <button type="button" className="btn-primary mt-2 w-full" onClick={() => router.push("/preferences")} data-testid="prefs-edit">
          ヒアリング結果を編集する
        </button>
      </Section>

      <Section id="goals" title="目標（メニュー作成の前提）" hint="変更は次のメニュー作成から反映されます。">
        <GoalsEditor
          value={goalsDraft ?? goalsOrDefault(settings.goals)}
          onChange={(g) => {
            // 保存の完了を待たずに画面へ反映する
            setGoalsDraft(g);
            void update({ goals: g });
          }}
        />
      </Section>

      <Section id="display" title="表示">
        <div className="flex gap-2">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} type="button" className="chip" data-selected={settings.theme === t} onClick={() => update({ theme: t })}>
              {t === "system" ? "端末に合わせる" : t === "light" ? "ライト" : "ダーク"}
            </button>
          ))}
        </div>
      </Section>

      <Section id="timer" title="タイマー">
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
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-muted">セット間の休憩タイマー</div>
          <ChipGroup
            label="セット間の休憩時間"
            options={REST_OPTIONS.map((v) => ({ value: v, label: v === null ? "種目ごと" : v % 60 === 0 ? `${v / 60}分` : `${v}秒` }))}
            value={settings.restTimerSec ?? null}
            onChange={(v) => update({ restTimerSec: v })}
            columns={4}
          />
          <p className="mt-1 text-[11px] text-muted">セットを完了すると自動で始まります（各種目の最終セットの後は出ません）。「種目ごと」は種目ごとの標準の休憩時間です。休憩中は ±10秒 で調整できます。</p>
        </div>
      </Section>

      <StoreManager onAdded={(id) => setStore(id)} />

      <Section id="equipment" title="店舗の器具" hint="「ない」にすると次回以降のメニューから自動的に除外されます。未確認は推測なので、実際に確認したら更新してください。「刻み」はその器具で何kgずつ重量を変えられるかで、メニューの重量と ± ボタンに使います。">
        <div className="mb-2 flex flex-wrap gap-1">
          {stores.map((s) => (
            <button key={s.id} type="button" className="chip flex-1 whitespace-nowrap" data-selected={store === s.id} onClick={() => setStore(s.id)}>
              {s.shortName}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setAll(true)} disabled={bulkBusy} data-testid="equipment-all-yes">
            すべて「ある」にする
          </button>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setAll(false)} disabled={bulkBusy} data-testid="equipment-all-no">
            すべて「ない」にする
          </button>
          <span className="basis-full text-[11px] text-muted">追加したジムでは「すべて「ない」」にしてから、ある器具だけ「ある」にすると早く設定できます。器具を「ある」にすると、その器具を使う標準の種目が種目一覧に加わります。</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map(({ eq, row }) => {
            const hiddenEx = hiddenExercisesUsing(eq.id);
            const state: "yes" | "no" | "unknown" = !row ? "unknown" : row.available ? (row.confirmed ? "yes" : "unknown") : "no";
            return (
              <li key={eq.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm" data-testid="equipment-row">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{eq.name}</div>
                  {row?.note && <div className="text-xs text-muted">{row.note}</div>}
                  {state === "yes" && hiddenEx.length > 0 && (
                    <button type="button" className="text-xs text-accent" onClick={async () => { for (const e of hiddenEx) await restoreExercise(e.id); }}>
                      この器具の種目（{hiddenEx.map((e) => e.name).join("・")}）を種目一覧に加える
                    </button>
                  )}
                </div>
                <div className="flex gap-1" role="radiogroup" aria-label={`${eq.name}の有無`}>
                  <button type="button" role="radio" aria-checked={state === "yes"} className="chip min-h-9 px-3 py-1 text-xs" data-selected={state === "yes"} onClick={() => markAvailable(eq.id)}>
                    ある
                  </button>
                  <button type="button" role="radio" aria-checked={state === "unknown"} className="chip min-h-9 px-3 py-1 text-xs" data-selected={state === "unknown"} onClick={() => setStoreEquipment(store, eq.id, { available: true, confirmed: false })}>
                    未確認
                  </button>
                  <button type="button" role="radio" aria-checked={state === "no"} className="chip min-h-9 px-3 py-1 text-xs" data-selected={state === "no"} onClick={() => setStoreEquipment(store, eq.id, { available: false, confirmed: true })}>
                    ない
                  </button>
                </div>
                {/* 重量の刻みは数字が隠れないよう、器具名の下に1行で */}
                {defaultStep[eq.id] !== undefined && state !== "no" && (
                  <label className="flex basis-full items-center gap-2 text-xs text-muted">
                    重量の刻み
                    <NumberField label={`${eq.name}の重量の刻み`} unit="kg" value={row?.stepKg ?? defaultStep[eq.id]} onChange={(v) => v && v > 0 && setStoreEquipment(store, eq.id, { stepKg: v })} step={0.5} min={0.5} max={20} size="sm" className="w-40 shrink-0" />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <CustomExerciseManager />

      <Section id="excluded" title="自動メニューから除外する種目" hint="チェックした種目は自動作成に含めません（手動追加は可能）。バードドッグは最初から含まれていません。">
        <ul className="grid grid-cols-1 gap-1 text-sm">
          {allEx.map((e) => {
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

      <Section id="access" title="アクセス保護" hint="サーバーに APP_PASSWORD を設定している場合、この端末のログイン状態を解除できます。">
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


      <Section id="data" title="データ" hint={`記録 ${workouts.length} 件（この端末の IndexedDB に保存）。機種変更時は JSON でエクスポート → 新しい端末でインポートしてください。`}>
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
          {/* ホーム画面に追加したアプリはアドレスバーがなく Safari とも保存領域が別なので、ここから復元ページへ行けるようにする */}
          <button type="button" className="btn-secondary col-span-2" onClick={() => router.push("/restore")}>
            復元コードで記録を取り込む
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

/** 器具ごとの刻みの初期値（重量のある器具は 5kg。自分で作った種目だけの器具はその刻み） */
function defaultSteps(exercises: ReturnType<typeof useExercises>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of exercises) {
    if (e.loadType !== "weight" && e.loadType !== "assist") continue;
    out[e.equipmentId] = Math.min(out[e.equipmentId] ?? Infinity, defaultStepOf(e));
  }
  return out;
}

const REST_OPTIONS: (number | null)[] = [null, 30, 45, 60, 90, 120, 150, 180];

function PreferencesSummary({ goals, prefs }: { goals: Goals; prefs: MenuPreferences }) {
  const rows: [string, string][] = [];
  if (prefs.experience) rows.push(["経験", EXPERIENCE_LABEL[prefs.experience]]);
  if (prefs.timeLimitMin !== undefined) rows.push(["時間", prefs.timeLimitMin === null ? "制限なし" : `${prefs.timeLimitMin}分`]);
  if (prefs.intensity) rows.push(["きつさ", INTENSITY_LABEL[prefs.intensity]]);
  if (prefs.equipmentStyle || goals.preferDumbbell) rows.push(["器具", EQUIPMENT_STYLE_LABEL[goals.preferDumbbell ? "dumbbell" : prefs.equipmentStyle!]]);
  if (prefs.cardio) rows.push(["有酸素", CARDIO_CHOICE_LABEL[prefs.cardio]]);
  if (prefs.warmupBike) rows.push(["ウォームアップのバイク", prefs.warmupBike === "yes" ? "使う" : "使わない"]);
  if (goals.priorityRegions.length) rows.push(["多めに", goals.priorityRegions.map((r) => REGION_LABEL[r]).join("・")]);
  if (prefs.lessRegions?.length) rows.push(["控えめに", prefs.lessRegions.map((r) => REGION_LABEL[r]).join("・")]);
  if (goals.favoriteExerciseIds.length) rows.push(["やりたい種目", goals.favoriteExerciseIds.map(exerciseName).join("・")]);
  if (prefs.dislikedExerciseIds?.length) rows.push(["やりたくない種目", prefs.dislikedExerciseIds.map(exerciseName).join("・")]);
  if (prefs.chronicPain) rows.push(["気をつけたい痛み", prefs.chronicPain]);
  if (prefs.bodyWeightKg || prefs.age) rows.push(["体格", [prefs.sex === "male" ? "男性" : prefs.sex === "female" ? "女性" : "", prefs.bodyWeightKg ? `${prefs.bodyWeightKg}kg` : "", prefs.age ? `${prefs.age}歳` : ""].filter(Boolean).join("・")]);
  const notes = prefs.notes ?? [];
  if (!rows.length && !notes.length) return <p className="text-sm text-muted">まだ設定されていません。</p>;
  return (
    <div className="space-y-2 text-sm" data-testid="prefs-summary">
      {rows.length > 0 && (
        <ul className="space-y-0.5">
          {rows.map(([k, v]) => (
            <li key={k}>
              <span className="text-muted">{k}：</span>
              {v}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-accent">これまでに伝えた希望（{notes.length}件）</summary>
          <ul className="mt-1 space-y-1 text-xs">
            {notes.slice(0, 10).map((n) => (
              <li key={n.id} className="rounded-lg bg-card-2 p-2">
                <div>「{n.text}」</div>
                <div className="text-muted">→ {n.changes.join("、") || "反映なし"}（{n.createdAt.slice(0, 10)}）</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Collapsible id={id} title={title} hint={hint}>
      {children}
    </Collapsible>
  );
}
