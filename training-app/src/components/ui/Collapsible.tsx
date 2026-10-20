"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "tc.settings.open";

function readOpen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function writeOpen(ids: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* 保存できなくても開閉はできる */
  }
}

/**
 * 見出しを押すと開く設定の項目
 * - 最初は閉じている。開いた項目は同じタブの間は覚えておく（別の画面から戻っても開いたまま）
 * - URL の #id と一致する項目は開いた状態でその位置まで移動する（例：/settings#stores）
 */
export function Collapsible({ id, title, hint, children, badge }: { id: string; title: string; hint?: string; children: React.ReactNode; badge?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== `#${id}`) return false;
      setOpen(true);
      writeOpen([...new Set([...readOpen(), id])]);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
      return true;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!openFromHash() && readOpen().includes(id)) setOpen(true);
    // 同じ画面の中で #id だけが変わったときも開く
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [id]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      const ids = readOpen().filter((x) => x !== id);
      writeOpen(next ? [...ids, id] : ids);
      return next;
    });
  };

  return (
    <section id={id} className="card scroll-mt-4 overflow-hidden" data-testid={`settings-${id}`}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-3 text-left" onClick={toggle} aria-expanded={open} aria-controls={`${id}-body`}>
        <h2 className="min-w-0 flex-1 font-semibold">{title}</h2>
        {badge}
        <span className="text-muted" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div id={`${id}-body`} className="border-t border-border px-3 pb-3 pt-2">
          {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}
