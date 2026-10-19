"use client";
import { useEffect, useState } from "react";
import type { BodyRegion, CardioChoice, EquipmentStyle, Experience, Goals, Intensity, MenuPreferences, PreferenceNote } from "@/lib/types";
import { ChipGroup, MultiChipGroup } from "@/components/ui/Chips";
import { REGION_LABEL, REGION_ORDER } from "@/lib/catalog/muscles";
import { goalsOrDefault } from "@/lib/goals";
import { applyWishOps, describeWishOp, CARDIO_CHOICE_LABEL, EQUIPMENT_STYLE_LABEL, EXPERIENCE_LABEL, INTENSITY_LABEL, TIME_OPTIONS } from "@/lib/preferences";
import { parseWish } from "@/lib/preferences/parse";
import { getSettings, updateSettings } from "@/lib/db/repo";
import { useExercises } from "@/hooks/useSettings";
import { newId } from "@/lib/id";

interface FormState {
  experience: Experience;
  timeLimit: number | null;
  intensity: Intensity;
  equipment: EquipmentStyle;
  cardio: CardioChoice;
  moreRegions: BodyRegion[];
  lessRegions: BodyRegion[];
  liked: string[];
  disliked: string[];
  chronicPain: string;
  wish: string;
}

/**
 * メニューの希望（初回のトレーニング前に質問し、設定画面からいつでも見直せる）
 * - first: はじめてのヒアリング（スキップ可）
 * - edit: 設定画面からの見直し
 */
export function PreferencesForm({ mode, onDone }: { mode: "first" | "edit"; onDone: () => void }) {
  const allEx = useExercises();
  const [form, setForm] = useState<FormState | null>(null);
  const [goalsBase, setGoalsBase] = useState<Goals | null>(null);
  const [prefsBase, setPrefsBase] = useState<MenuPreferences>({});
  const [busy, setBusy] = useState(false);
  const [openList, setOpenList] = useState<"liked" | "disliked" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      const g = goalsOrDefault(s.goals);
      const p = s.preferences ?? {};
      setGoalsBase(g);
      setPrefsBase(p);
      setForm({
        experience: p.experience ?? "beginner",
        timeLimit: p.timeLimitMin !== undefined ? p.timeLimitMin : (s.lastTimeLimitMin ?? 60),
        intensity: p.intensity ?? "normal",
        // ダンベル優先は目標側のチェックが正（設定画面で外された場合は「どちらでも」に戻す）
        equipment: g.preferDumbbell ? "dumbbell" : p.equipmentStyle === "machine" ? "machine" : "balanced",
        cardio: p.cardio ?? s.lastCardio ?? "walk",
        moreRegions: g.priorityRegions,
        lessRegions: p.lessRegions ?? [],
        liked: g.favoriteExerciseIds,
        disliked: p.dislikedExerciseIds ?? [],
        chronicPain: p.chronicPain ?? "",
        wish: "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!form || !goalsBase) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  const wishOps = form.wish.trim() ? parseWish(form.wish) : [];
  const wishPreview = wishOps.map(describeWishOp);
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  // 「多め」と「控えめ」、「やりたい」と「やりたくない」は両方には入らない
  const setMore = (v: BodyRegion[]) => setForm((f) => (f ? { ...f, moreRegions: v, lessRegions: f.lessRegions.filter((r) => !v.includes(r)) } : f));
  const setLess = (v: BodyRegion[]) => setForm((f) => (f ? { ...f, lessRegions: v, moreRegions: f.moreRegions.filter((r) => !v.includes(r)) } : f));
  const setLiked = (v: string[]) => setForm((f) => (f ? { ...f, liked: v, disliked: f.disliked.filter((x) => !v.includes(x)) } : f));
  const setDisliked = (v: string[]) => setForm((f) => (f ? { ...f, disliked: v, liked: f.liked.filter((x) => !v.includes(x)) } : f));
  const exOptions = allEx.map((e) => ({ value: e.id, label: e.name }));

  const save = async (skip: boolean) => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      let goals: Goals = goalsBase;
      let prefs: MenuPreferences = { ...prefsBase, answeredAt: prefsBase.answeredAt ?? now };
      if (!skip) {
        goals = { ...goalsBase, priorityRegions: form.moreRegions, favoriteExerciseIds: form.liked, preferDumbbell: form.equipment === "dumbbell" };
        prefs = {
          ...prefs,
          experience: form.experience,
          timeLimitMin: form.timeLimit,
          intensity: form.intensity,
          equipmentStyle: form.equipment,
          cardio: form.cardio,
          lessRegions: form.lessRegions,
          dislikedExerciseIds: form.disliked,
          chronicPain: form.chronicPain.trim() || undefined,
        };
        // 自由記述の希望も同じように反映する
        if (wishOps.length || form.wish.trim()) {
          const r = applyWishOps(goals, prefs, wishOps);
          goals = r.goals;
          const note: PreferenceNote = { id: newId("wish"), text: form.wish.trim().slice(0, 200), changes: r.changes, createdAt: now };
          prefs = { ...r.prefs, notes: [note, ...(r.prefs.notes ?? [])].slice(0, 30) };
        }
      }
      await updateSettings({
        goals,
        preferences: prefs,
        // 毎回のヒアリングの初期値も希望に合わせる
        ...(skip ? {} : { lastTimeLimitMin: prefs.timeLimitMin, lastCardio: prefs.cardio }),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-28" data-testid="prefs-form">
      <header>
        <h1 className="text-2xl font-bold">{mode === "first" ? "はじめてのヒアリング" : "メニューの希望"}</h1>
        <p className="text-sm text-muted">
          {mode === "first"
            ? "あなたに合ったメニューを作るために、いくつか質問します（1分ほど）。答えた内容は毎回のメニュー作成に使い、あとから設定画面やコーチへの一言で変えられます。"
            : "毎回のメニュー作成で考慮する希望です。コーチに「次から〇〇はやりたくない」と伝えても変わります。"}
        </p>
      </header>

      <Field label="筋トレの経験">
        <ChipGroup label="筋トレの経験" options={(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((k) => ({ value: k, label: EXPERIENCE_LABEL[k] }))} value={form.experience} onChange={set("experience")} columns={4} />
      </Field>
      <Field label="1回のトレーニング時間">
        <ChipGroup label="1回のトレーニング時間" options={TIME_OPTIONS} value={form.timeLimit} onChange={set("timeLimit")} columns={3} />
      </Field>
      <Field label="きつさの好み">
        <ChipGroup label="きつさの好み" options={(Object.keys(INTENSITY_LABEL) as Intensity[]).map((k) => ({ value: k, label: INTENSITY_LABEL[k] }))} value={form.intensity} onChange={set("intensity")} columns={3} />
      </Field>
      <Field label="使いたい器具">
        <ChipGroup label="使いたい器具" options={(Object.keys(EQUIPMENT_STYLE_LABEL) as EquipmentStyle[]).map((k) => ({ value: k, label: EQUIPMENT_STYLE_LABEL[k] }))} value={form.equipment} onChange={set("equipment")} columns={3} />
      </Field>
      <Field label="有酸素運動">
        <ChipGroup label="有酸素運動の希望" options={(["none", "walk", "run"] as CardioChoice[]).map((k) => ({ value: k, label: CARDIO_CHOICE_LABEL[k] }))} value={form.cardio} onChange={set("cardio")} columns={3} />
      </Field>
      <Field label="多めに鍛えたい部位（任意）">
        <MultiChipGroup label="多めに鍛えたい部位" options={REGION_ORDER.map((r) => ({ value: r, label: REGION_LABEL[r] }))} value={form.moreRegions} onChange={setMore} />
      </Field>
      <Field label="控えめにしたい部位（任意）">
        <MultiChipGroup label="控えめにしたい部位" options={REGION_ORDER.map((r) => ({ value: r, label: REGION_LABEL[r] }))} value={form.lessRegions} onChange={setLess} />
      </Field>
      <Field label="種目の好み（任意）">
        <div className="space-y-2">
          <button type="button" className="text-sm font-semibold text-accent" onClick={() => setOpenList((v) => (v === "liked" ? null : "liked"))} aria-expanded={openList === "liked"}>
            {openList === "liked" ? "▾" : "▸"} 定期的にやりたい種目（{form.liked.length}件）
          </button>
          {openList === "liked" && <MultiChipGroup label="やりたい種目" options={exOptions} value={form.liked} onChange={setLiked} />}
          <button type="button" className="block text-sm font-semibold text-accent" onClick={() => setOpenList((v) => (v === "disliked" ? null : "disliked"))} aria-expanded={openList === "disliked"}>
            {openList === "disliked" ? "▾" : "▸"} やりたくない種目（{form.disliked.length}件）
          </button>
          {openList === "disliked" && <MultiChipGroup label="やりたくない種目" options={exOptions} value={form.disliked} onChange={setDisliked} />}
        </div>
      </Field>
      <Field label="普段から気をつけたいケガ・痛み（任意）">
        <input className="input" placeholder="例：右膝が弱い、腰を痛めやすい" value={form.chronicPain} onChange={(e) => set("chronicPain")(e.target.value)} aria-label="普段から気をつけたいケガ・痛み" data-testid="prefs-pain" />
        <p className="mt-1 text-[11px] text-muted">負担がかかりやすい種目を毎回のメニューから外します。</p>
      </Field>
      <Field label="その他の希望（任意）">
        <textarea className="input min-h-20" placeholder="例：スクワットは苦手、腕をもっと鍛えたい、ランニングはしたくない" value={form.wish} onChange={(e) => set("wish")(e.target.value)} aria-label="その他の希望" data-testid="prefs-wish" />
        {form.wish.trim() && (
          <p className="mt-1 text-xs text-muted" data-testid="prefs-wish-preview">
            {wishPreview.length ? `こう反映します：${wishPreview.join("、")}` : "読み取れる希望がありませんでした。種目名や部位と「やりたい」「やりたくない」「多め」「控えめ」などを組み合わせて書いてください。"}
          </p>
        )}
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg bg-bg/95 px-4 pt-2 safe-bottom backdrop-blur">
        <div className="flex gap-2">
          {mode === "first" && (
            <button type="button" className="btn-secondary px-4 py-4" disabled={busy} onClick={() => save(true)} data-testid="prefs-skip">
              スキップ
            </button>
          )}
          <button type="button" className="btn-primary flex-1 py-4 text-lg" disabled={busy} onClick={() => save(false)} data-testid="prefs-submit">
            {busy ? "保存中…" : mode === "first" ? "この内容でつぎへ" : "保存する"}
          </button>
        </div>
      </div>
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
