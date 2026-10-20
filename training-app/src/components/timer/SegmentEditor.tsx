"use client";
import type { CardioSegment } from "@/lib/types";
import { NumberField } from "@/components/ui/NumberField";

/** バイク・トレッドミルの区間（計画・タイマー共通の形） */
export type EditableSegment = Pick<CardioSegment, "id" | "durationSec" | "speedKmh" | "speedMaxKmh" | "inclinePct" | "level" | "label"> & { kind: string };

const KIND_LABEL: Record<string, string> = { walk: "ウォーキング", run: "ランニング", bike: "バイク", cooldown: "クールダウン", warmup: "準備" };

/** 区間の時間・負荷を1か所変える。バイクの「バイク L15」のような名前は負荷に合わせて書き換える */
export function patchSegment<T extends EditableSegment>(segs: T[], id: string, p: Partial<EditableSegment>): T[] {
  return segs.map((s) => {
    if (s.id !== id) return s;
    const next = { ...s, ...p } as T;
    if (p.level !== undefined && /^バイク L\d+/.test(s.label ?? "")) next.label = `バイク L${p.level}`;
    // 速度を自分で決めたら、幅（〜km/h）の表示はやめる
    if (p.speedKmh !== undefined) delete next.speedMaxKmh;
    return next;
  });
}

/**
 * 区間ごとの時間と負荷（バイクはレベル、トレッドミルは速度と傾斜）を変える欄
 * 作られた計画はそのまま使え、変えたいところだけ変えられる
 */
export function SegmentEditor<T extends EditableSegment>({ segments, onChange }: { segments: T[]; onChange: (segs: T[]) => void }) {
  const set = (id: string, p: Partial<EditableSegment>) => onChange(patchSegment(segments, id, p));
  return (
    <ul className="space-y-2" data-testid="segment-editor">
      {segments.map((s, i) => {
        const name = `${i + 1}. ${s.label ?? KIND_LABEL[s.kind] ?? s.kind}`;
        const isBike = s.level !== undefined || s.kind === "bike";
        return (
          <li key={s.id} className="rounded-xl border border-border p-2" data-testid="segment-row">
            <div className="mb-1 text-xs font-semibold">{name}</div>
            <div className="flex flex-wrap gap-2">
              <NumberField label={`${name}の時間`} unit="分" value={Math.round((s.durationSec / 60) * 10) / 10} onChange={(v) => set(s.id, { durationSec: Math.max(30, Math.round((v ?? 0.5) * 60)) })} step={1} min={0.5} max={120} size="sm" className="w-36" />
              {isBike ? (
                <NumberField label={`${name}の負荷`} unit="L" value={s.level} onChange={(v) => v !== undefined && set(s.id, { level: v })} step={1} min={1} max={40} decimals={0} size="sm" className="w-40" />
              ) : (
                <>
                  <NumberField label={`${name}の速度`} unit="km/h" value={s.speedKmh} onChange={(v) => v !== undefined && set(s.id, { speedKmh: v })} step={0.5} min={1} max={25} size="sm" className="w-40" />
                  <NumberField label={`${name}の傾斜`} unit="%" value={s.inclinePct} onChange={(v) => set(s.id, { inclinePct: v ?? 0 })} step={1} min={0} max={15} decimals={0} size="sm" className="w-32" />
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
