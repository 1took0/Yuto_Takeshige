"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BodyRegion, CardioPreference, FocusArea, IntakeAnswers, StoreId } from "@/lib/types";
import { STORES } from "@/lib/catalog/stores";
import { FOCUS_LABEL, REGION_LABEL, REGION_ORDER } from "@/lib/catalog/muscles";
import { ChipGroup, MultiChipGroup } from "@/components/ui/Chips";
import { useSettings } from "@/hooks/useSettings";
import { useActiveWorkout } from "./ActiveWorkoutProvider";
import { generatePlan } from "@/lib/planner";
import { getSettings, listCompletedWorkouts, listStoreEquipment, rememberIntakeDefaults } from "@/lib/db/repo";
import { ConfirmDialog } from "@/components/ui/Sheet";

const TIME_OPTIONS: { value: number | null; label: string }[] = [
  { value: 30, label: "30分" },
  { value: 45, label: "45分" },
  { value: 60, label: "60分" },
  { value: 90, label: "90分" },
  { value: 120, label: "120分" },
  { value: null, label: "制限なし" },
];

interface FormState {
  storeId: StoreId;
  timeLimit: number | null;
  condition: IntakeAnswers["condition"];
  soreness: boolean;
  soreRegions: BodyRegion[];
  soreLevel: NonNullable<IntakeAnswers["soreLevel"]>;
  pain: boolean;
  painDesc: string;
  focus: FocusArea;
  cardio: CardioPreference;
  memo: string;
}

export function IntakeForm({ presetMemo }: { presetMemo?: string }) {
  const router = useRouter();
  const { settings } = useSettings();
  const { workout: active, setWorkout } = useActiveWorkout();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  // 前回の店舗・時間・有酸素を初期値に（変更可能）
  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setForm({
        storeId: s.lastStoreId ?? "ichijoji",
        timeLimit: s.lastTimeLimitMin === undefined ? 90 : s.lastTimeLimitMin,
        condition: 4,
        soreness: false,
        soreRegions: [],
        soreLevel: "light",
        pain: false,
        painDesc: "",
        focus: "auto",
        cardio: s.lastCardio ?? "run",
        memo: presetMemo ?? "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [presetMemo]);

  if (!form) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  const { storeId, timeLimit, condition, soreness, soreRegions, soreLevel, pain, painDesc, focus, cardio, memo } = form;
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setStoreId = set("storeId");
  const setTimeLimit = set("timeLimit");
  const setCondition = set("condition");
  const setSoreness = set("soreness");
  const setSoreRegions = set("soreRegions");
  const setSoreLevel = set("soreLevel");
  const setPain = set("pain");
  const setPainDesc = set("painDesc");
  const setFocus = set("focus");
  const setCardio = set("cardio");
  const setMemo = set("memo");

  const buildIntake = (): IntakeAnswers => ({
    storeId,
    timeLimitMin: timeLimit,
    condition,
    soreness,
    soreRegions: soreness ? soreRegions : [],
    soreLevel: soreness ? soreLevel : undefined,
    pain: { present: pain, description: pain ? painDesc : undefined },
    focus,
    cardio,
    memo: memo || undefined,
  });

  const submit = async () => {
    setBusy(true);
    try {
      const intake = buildIntake();
      const [history, equipment] = await Promise.all([listCompletedWorkouts(), listStoreEquipment()]);
      const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: settings?.excludedExerciseIds ?? [] } });
      await setWorkout(workout);
      await rememberIntakeDefaults(storeId, timeLimit, cardio);
      router.push("/workout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-28">
      <header className="flex items-center gap-2">
        <button type="button" className="btn-ghost -ml-3 px-3" onClick={() => router.back()} aria-label="戻る">
          ←
        </button>
        <h1 className="text-2xl font-bold">今日のコンディション</h1>
      </header>

      <Field label="店舗">
        <ChipGroup label="店舗" options={STORES.map((s) => ({ value: s.id, label: s.shortName }))} value={storeId} onChange={setStoreId} columns={3} />
      </Field>
      <Field label="トレーニング時間">
        <ChipGroup label="時間" options={TIME_OPTIONS} value={timeLimit} onChange={setTimeLimit} columns={3} />
      </Field>
      <Field label="体調（1=悪い 〜 5=とても良い）">
        <ChipGroup label="体調" options={[1, 2, 3, 4, 5].map((n) => ({ value: n as IntakeAnswers["condition"], label: String(n) }))} value={condition} onChange={setCondition} columns={5} />
      </Field>
      <Field label="筋肉痛・疲労">
        <ChipGroup
          label="筋肉痛・疲労"
          options={[
            { value: false, label: "なし" },
            { value: true, label: "あり" },
          ]}
          value={soreness}
          onChange={setSoreness}
          columns={2}
        />
        {soreness && (
          <div className="mt-3 space-y-3 rounded-xl bg-card-2 p-3">
            <div>
              <div className="mb-1 text-xs text-muted">疲労部位（複数選択）</div>
              <MultiChipGroup label="疲労部位" options={REGION_ORDER.map((r) => ({ value: r, label: REGION_LABEL[r] }))} value={soreRegions} onChange={setSoreRegions} />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">疲労の強さ</div>
              <ChipGroup
                label="疲労の強さ"
                options={[
                  { value: "light" as const, label: "軽い" },
                  { value: "moderate" as const, label: "中程度" },
                  { value: "severe" as const, label: "強い" },
                ]}
                value={soreLevel}
                onChange={setSoreLevel}
                columns={3}
              />
            </div>
          </div>
        )}
      </Field>
      <Field label="痛み・違和感">
        <ChipGroup
          label="痛み・違和感"
          options={[
            { value: false, label: "なし" },
            { value: true, label: "あり" },
          ]}
          value={pain}
          onChange={setPain}
          columns={2}
        />
        {pain && <input className="input mt-2" placeholder="部位・症状（例：腰に張り、右膝に違和感）" value={painDesc} onChange={(e) => setPainDesc(e.target.value)} aria-label="痛みの部位・症状" />}
      </Field>
      <Field label="重点部位">
        <ChipGroup label="重点部位" options={(Object.keys(FOCUS_LABEL) as FocusArea[]).map((k) => ({ value: k, label: FOCUS_LABEL[k] }))} value={focus} onChange={setFocus} columns={3} />
      </Field>
      <Field label="有酸素運動">
        <ChipGroup
          label="有酸素"
          options={[
            { value: "walk" as const, label: "ウォーキングのみ" },
            { value: "run" as const, label: "ランニング込み", hint: "疲労により変更あり" },
          ]}
          value={cardio}
          onChange={setCardio}
          columns={2}
        />
      </Field>
      <Field label="メモ（任意）">
        <input className="input" placeholder="例：今日は早めに切り上げたい" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="メモ" />
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg bg-bg/95 px-4 pt-2 safe-bottom backdrop-blur">
        <button type="button" className="btn-primary w-full py-4 text-lg" disabled={busy} onClick={() => (active ? setConfirmReplace(true) : submit())} data-testid="generate">
          {busy ? "メニュー作成中…" : "メニューを作成"}
        </button>
      </div>
      <ConfirmDialog
        open={confirmReplace}
        title="進行中のトレーニングがあります"
        message="新しいメニューを作成すると、進行中の記録は破棄されます。先に保存する場合はトレーニング画面から終了してください。"
        confirmLabel="破棄して作成"
        danger
        onConfirm={async () => {
          const { deleteWorkout } = await import("@/lib/db/repo");
          if (active) await deleteWorkout(active.id);
          await submit();
        }}
        onClose={() => setConfirmReplace(false)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-muted">{label}</h2>
      {children}
    </section>
  );
}
