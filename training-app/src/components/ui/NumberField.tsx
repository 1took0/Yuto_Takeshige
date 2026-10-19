"use client";
import { useState } from "react";

interface Props {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** 小数を許可 */
  decimals?: number;
}

/**
 * 片手で素早く編集できる数値入力（− / 入力 / ＋）
 * 入力中はローカル状態を保持し、確定（blur/Enter）で親に反映する
 */
export function NumberField({ value, onChange, step = 5, min = 0, max = 999, unit, label, placeholder = "—", size = "md", className = "", decimals = 1 }: Props) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);
  // 外部から値が変わったら（入力中でなければ）表示を追従させる
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!focused) setText(value === undefined ? "" : String(value));
  }

  const commit = (raw: string) => {
    const t = raw.trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace("．", ".");
    if (t === "") {
      onChange(undefined);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setText(value === undefined ? "" : String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n * 10 ** decimals) / 10 ** decimals));
    onChange(clamped);
    setText(String(clamped));
  };
  const bump = (d: number) => {
    const base = value ?? 0;
    const next = Math.min(max, Math.max(min, Math.round((base + d) * 10 ** decimals) / 10 ** decimals));
    onChange(next);
    setText(String(next));
  };
  const h = size === "lg" ? "h-14 text-2xl" : size === "sm" ? "h-10 text-base" : "h-12 text-xl";
  const btn = size === "lg" ? "w-14" : size === "sm" ? "w-10" : "w-11";
  return (
    <div className={`inline-flex min-w-0 items-stretch overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <button type="button" className={`tap ${btn} ${h} shrink-0 border-r border-border text-muted active:bg-card-2`} onClick={() => bump(-step)} aria-label={`${label ?? ""}を${step}減らす`}>
        −
      </button>
      <div className="flex min-w-0 flex-1 items-center">
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          aria-label={label}
          className={`${h} w-full min-w-0 bg-transparent px-1 text-right font-semibold tabular outline-none`}
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        {/* 数字と単位がくっつかないようにすき間を空ける。未入力のときは単位を出さない */}
        {unit && text.trim() !== "" && <span className="shrink-0 pl-1 pr-1.5 text-[11px] text-muted">{unit}</span>}
      </div>
      <button type="button" className={`tap ${btn} ${h} shrink-0 border-l border-border text-muted active:bg-card-2`} onClick={() => bump(step)} aria-label={`${label ?? ""}を${step}増やす`}>
        ＋
      </button>
    </div>
  );
}
