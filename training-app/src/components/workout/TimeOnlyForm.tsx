"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StoreId, Workout } from "@/lib/types";
import { ChipGroup } from "@/components/ui/Chips";
import { useStores } from "@/hooks/useSettings";
import { getSettings, saveWorkout, updateSettings } from "@/lib/db/repo";
import { defaultStoreId, storeName } from "@/lib/catalog/stores";
import { formatJaDate, tokyoParts, trainingDateOf } from "@/lib/date/trainingDay";
import { newId } from "@/lib/id";
import { useToast } from "@/components/ui/Toast";

const pad = (n: number) => String(n).padStart(2, "0");
/** 東京の時刻 "HH:MM"（5分単位に切り捨て） */
function hhmm(d: Date): string {
  const p = tokyoParts(d);
  return `${pad(p.hour)}:${pad(Math.floor(p.minute / 5) * 5)}`;
}
/**
 * トレーニング日と時刻（東京）から ISO 文字列を作る
 * 1日は朝6時区切りなので、6時より前の時刻は暦の翌日として扱う
 */
function isoOf(ymd: string, time: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d + (hh < 6 ? 1 : 0), hh - 9, mm)).toISOString();
}

/**
 * 時間だけ記録する（種目・セットは入れない）
 * 日付・店舗・開始と終了の時刻だけを保存する。「みんな」ではこの時間で量を表す
 */
export function TimeOnlyForm() {
  const router = useRouter();
  const toast = useToast();
  const stores = useStores();
  const [storeId, setStoreId] = useState<StoreId | null>(null);
  const today = trainingDateOf();
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(() => hhmm(new Date(Date.now() - 60 * 60 * 1000)));
  const [end, setEnd] = useState(() => hhmm(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (!cancelled) setStoreId(defaultStoreId(s.lastStoreId));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validStore = storeId && stores.some((s) => s.id === storeId) ? storeId : (stores[0]?.id ?? storeId);
  const startedAt = isoOf(date, start);
  // 終了が開始より前なら、日をまたいだものとして扱う
  let endedAt = isoOf(date, end);
  if (endedAt <= startedAt) endedAt = new Date(Date.parse(endedAt) + 24 * 60 * 60 * 1000).toISOString();
  const minutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000);
  const valid = !!validStore && !!start && !!end && minutes > 0 && minutes <= 6 * 60;

  const save = async () => {
    if (!validStore || !valid) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const w: Workout = {
        id: newId("w"),
        trainingDate: date,
        startedAt,
        endedAt,
        storeId: validStore,
        storeLabel: storeName(validStore),
        exercises: [],
        cardio: [],
        status: "completed",
        source: "app",
        manual: true,
        timeOnly: true,
        durations: { totalMin: minutes, manual: true },
        createdAt: now,
        updatedAt: now,
      };
      await saveWorkout(w);
      await updateSettings({ lastStoreId: validStore });
      toast(`${formatJaDate(date)}・${minutes}分を記録しました`, "success");
      router.push(`/history/${w.id}?saved=1`);
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
        <h1 className="text-2xl font-bold">時間だけ記録</h1>
      </header>
      <p className="text-sm text-muted">種目やセットは入れず、いつ・どこで・何時から何時までトレーニングしたかだけを記録します。</p>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">日付</h2>
        <input type="date" className="input w-auto" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} aria-label="日付" data-testid="time-date" />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">店舗</h2>
        <ChipGroup label="店舗" options={stores.map((s) => ({ value: s.id, label: s.shortName }))} value={validStore} onChange={setStoreId} columns={3} />
        <Link href="/settings#stores" className="mt-2 inline-block text-xs text-accent">
          ＋ 店舗を追加・編集
        </Link>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">時刻</h2>
        <div className="flex items-center gap-2">
          <input type="time" className="input w-auto" value={start} step={300} onChange={(e) => setStart(e.target.value)} aria-label="開始時刻" data-testid="time-start" />
          <span className="text-muted">〜</span>
          <input type="time" className="input w-auto" value={end} step={300} onChange={(e) => setEnd(e.target.value)} aria-label="終了時刻" data-testid="time-end" />
        </div>
        <p className={`mt-2 text-sm ${valid ? "" : "text-danger"}`} data-testid="time-total">
          {minutes > 6 * 60 ? "6時間を超えています。時刻を確かめてください" : `合計 ${minutes}分`}
        </p>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg bg-bg/95 px-4 pt-2 safe-bottom backdrop-blur">
        <button type="button" className="btn-primary w-full py-4 text-lg" disabled={busy || !valid} onClick={save} data-testid="time-save">
          {busy ? "保存中…" : "この時間で記録する"}
        </button>
      </div>
    </div>
  );
}
