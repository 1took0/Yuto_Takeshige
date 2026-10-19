"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BodyRegion, CardioChoice, FocusArea, IntakeAnswers, StoreId } from "@/lib/types";
import { STORES } from "@/lib/catalog/stores";
import { FOCUS_LABEL, REGION_LABEL, REGION_ORDER } from "@/lib/catalog/muscles";
import { ChipGroup, MultiChipGroup } from "@/components/ui/Chips";
import { useStores } from "@/hooks/useSettings";
import Link from "next/link";
import { useActiveWorkout } from "./ActiveWorkoutProvider";
import { generatePlan } from "@/lib/planner";
import { getSettings, listCompletedWorkouts, listStoreEquipment, rememberIntakeDefaults, saveWish } from "@/lib/db/repo";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { TIME_OPTIONS } from "@/lib/preferences";
import { isStandingWish, parseWish } from "@/lib/preferences/parse";
import { useToast } from "@/components/ui/Toast";

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
  cardio: CardioChoice;
  memo: string;
}

export function IntakeForm({ presetMemo }: { presetMemo?: string }) {
  const router = useRouter();
  const toast = useToast();
  const stores = useStores();
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
        storeId: s.lastStoreId && (s.customStores ?? []).concat(STORES).some((x) => x.id === s.lastStoreId) ? s.lastStoreId : "ichijoji",
        timeLimit: s.lastTimeLimitMin === undefined ? 90 : s.lastTimeLimitMin,
        condition: 4,
        soreness: false,
        soreRegions: [],
        soreLevel: "light",
        pain: false,
        painDesc: "",
        focus: "auto",
        cardio: s.lastCardio ?? s.preferences?.cardio ?? "run",
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
      // メモに「次から〇〇」のような今後の希望があれば保存し、今日のメニューから反映する
      if (memo && isStandingWish(memo)) {
        const changes = await saveWish(memo, parseWish(memo));
        if (changes.length) toast(`今後のメニューに反映します：${changes.join("、")}`);
      }
      const [history, equipment, s] = await Promise.all([listCompletedWorkouts(), listStoreEquipment(), getSettings()]);
      const { workout } = generatePlan({ intake, history, storeEquipment: equipment, settings: { excludedExerciseIds: s.excludedExerciseIds, goals: s.goals, preferences: s.preferences } });
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
        <ChipGroup label="店舗" options={stores.map((s) => ({ value: s.id, label: s.shortName }))} value={storeId} onChange={setStoreId} columns={3} />
        <Link href="/settings#stores" className="mt-2 inline-block text-xs text-accent">＋ 店舗を追加・編集</Link>
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
            { value: "none" as const, label: "なし" },
            { value: "walk" as const, label: "ウォーキングのみ" },
            { value: "run" as const, label: "ランニング込み", hint: "疲労により変更あり" },
          ]}
          value={cardio}
          onChange={setCardio}
          columns={3}
        />
      </Field>
      <Field label="メモ（任意）">
        <input className="input" placeholder="例：次からスクワットは外してほしい" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="メモ" data-testid="intake-memo" />
        <p className="mt-1 text-[11px] text-muted">「次から」「今後は」「いつも」などを付けて書くと、以降のメニューにも反映します。</p>
        <Link href="/start?manual=1" className="mt-3 inline-block text-sm text-accent" data-testid="manual-link">
          メニューを作らず自分で入力する →
        </Link>
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
