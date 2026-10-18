"use client";

export function ChipGroup<T extends string | number | boolean | null>({
  options,
  value,
  onChange,
  label,
  columns,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  columns?: number;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={columns ? `grid gap-2` : "flex flex-wrap gap-2"} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-selected={o.value === value}
          className="chip flex-col gap-0 leading-tight"
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {o.hint && <span className="text-[10px] opacity-70">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function MultiChipGroup<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label?: string }) {
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value.includes(o.value)} data-selected={value.includes(o.value)} className="chip" onClick={() => toggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
