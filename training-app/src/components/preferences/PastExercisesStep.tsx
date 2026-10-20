"use client";
import { useState } from "react";
import type { PastExercise } from "@/lib/types";
import { deletedBuiltinExercises, getExercise } from "@/lib/catalog/exercises";
import { useExercises, useSettings } from "@/hooks/useSettings";
import { restoreExercise } from "@/lib/db/repo";
import { Sheet } from "@/components/ui/Sheet";
import { CustomExerciseForm } from "@/components/settings/CustomExerciseForm";
import { musclesLabel } from "@/lib/catalog/muscles";
import { NumberField } from "@/components/ui/NumberField";
import { CloseIcon } from "@/components/ui/Icons";

/**
 * ヒアリングの2ページ目：これまでに行っていたトレーニング種目
 * 種目を選び、分かれば重量・回数を入れる。メニュー作成で選びやすくし、初めての重量の参考にする
 * 選べるのは種目一覧の種目すべて。一覧に無い種目は「＋ 種目を追加」から標準の種目を戻すか、新しく作って選ぶ
 */
export function PastExercisesStep({
  value,
  onChange,
}: {
  value: PastExercise[];
  onChange: (v: PastExercise[]) => void;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  // 設定（削除・追加した種目）が変わったら描き直す
  useSettings();
  const list = useExercises();
  const all = [
    ...list.filter((e) => e.custom),
    ...list.filter((e) => !e.custom),
  ];
  const hidden = deletedBuiltinExercises();
  const choose = (id: string) =>
    onChange(
      value.some((x) => x.exerciseId === id)
        ? value
        : [...value, { exerciseId: id }],
    );
  const chosen = new Set(value.map((p) => p.exerciseId));
  const options = all.filter(
    (e) =>
      !chosen.has(e.id) &&
      (!q || e.name.includes(q) || musclesLabel(e.primary).includes(q)),
  );
  const patch = (id: string, p: Partial<PastExercise>) =>
    onChange(value.map((x) => (x.exerciseId === id ? { ...x, ...p } : x)));

  return (
    <div className="space-y-4" data-testid="prefs-past">
      {value.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">
            選んだ種目（{value.length}件）
          </h2>
          <ul className="space-y-2">
            {value.map((p) => {
              const def = getExercise(p.exerciseId);
              const weighted =
                def?.loadType === "weight" || def?.loadType === "assist";
              return (
                <li
                  key={p.exerciseId}
                  className="rounded-xl border border-border p-2"
                  data-testid="past-ex-chosen"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {def?.name ?? p.exerciseId}
                    </span>
                    <button
                      type="button"
                      className="tap flex h-8 w-8 items-center justify-center rounded-full text-muted"
                      onClick={() =>
                        onChange(
                          value.filter((x) => x.exerciseId !== p.exerciseId),
                        )
                      }
                      aria-label={`${def?.name ?? ""}を外す`}
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                  {def?.loadType !== "time" && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {weighted && (
                        <NumberField
                          label={`${def?.name ?? ""}の重量`}
                          unit="kg"
                          value={p.weight}
                          onChange={(v) => patch(p.exerciseId, { weight: v })}
                          step={2.5}
                          max={500}
                          size="sm"
                          className="w-40 shrink-0"
                          placeholder="重量"
                        />
                      )}
                      {
                        <NumberField
                          label={`${def?.name ?? ""}の回数`}
                          unit="回"
                          value={p.reps}
                          onChange={(v) => patch(p.exerciseId, { reps: v })}
                          step={1}
                          max={50}
                          size="sm"
                          className="w-36 shrink-0"
                          placeholder="回数"
                        />
                      }
                      <span>分かれば（任意）</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">種目一覧から選ぶ</h2>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setAdding(true)}
          data-testid="past-ex-add"
        >
          ＋ 種目を追加
        </button>
        <input
          className="input"
          placeholder="種目名・部位で検索（例：ベンチ、脚）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="これまでの種目を検索"
          data-testid="prefs-past-search"
        />
        <ul
          className="divide-y divide-border rounded-xl border border-border"
          data-testid="past-ex-options"
        >
          {options.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="tap flex w-full items-center gap-2 px-3 py-2 text-left"
                onClick={() => onChange([...value, { exerciseId: e.id }])}
                data-testid="past-ex-option"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {musclesLabel(e.primary)}
                  </span>
                </span>
                <span className="text-accent">＋</span>
              </button>
            </li>
          ))}
          {!options.length && (
            <li className="px-3 py-4 text-center text-sm text-muted">
              該当する種目がありません
            </li>
          )}
        </ul>
      </section>

      {/* 種目一覧に無い種目：標準の種目を一覧に戻すか、新しく作る。どちらも選んだ種目に入る */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="種目を追加">
        <button
          type="button"
          className="btn-secondary mb-3 w-full"
          onClick={() => setCreating(true)}
          data-testid="past-ex-create"
        >
          ＋ 新しい種目を作る
        </button>
        {hidden.length > 0 && (
          <h3 className="mb-1 text-xs font-semibold text-muted">
            一覧に入っていない標準の種目（{hidden.length}件）
          </h3>
        )}
        <ul className="divide-y divide-border">
          {hidden.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="tap flex w-full items-center gap-2 py-2 text-left"
                onClick={async () => {
                  await restoreExercise(e.id);
                  choose(e.id);
                  setAdding(false);
                }}
                data-testid="past-ex-hidden"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {musclesLabel(e.primary)}
                  </span>
                </span>
                <span className="text-accent">＋</span>
              </button>
            </li>
          ))}
        </ul>
        <CustomExerciseForm
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={(def) => {
            if (def) {
              choose(def.id);
              setAdding(false);
            }
          }}
        />
      </Sheet>
    </div>
  );
}
