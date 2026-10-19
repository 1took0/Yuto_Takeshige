"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** 長押しと判定するまでの時間と、それまでに動いてよい距離（超えたらスクロールとみなす） */
const HOLD_MS = 350;
const SLOP_PX = 8;
/** 画面の上端・下端からこの距離に指があると自動でスクロールする（上は固定ヘッダーの分だけ広め） */
const EDGE_TOP_PX = 130;
const EDGE_BOTTOM_PX = 110;

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  timer?: ReturnType<typeof setTimeout>;
  active: boolean;
  /** つかんだ位置とカード上端の差 */
  grab: number;
  /** 現在カードに適用している移動量 */
  dy: number;
  /** 並べ替えを依頼して、まだ画面に反映されていない */
  pending: boolean;
  lastY: number;
}

/** 要素の画面上の上端（transform を含まない） */
function layoutTopOf(el: HTMLElement): number {
  const parent = el.offsetParent as HTMLElement | null;
  const base = parent ? parent.getBoundingClientRect().top + parent.clientTop : -window.scrollY;
  return base + el.offsetTop;
}

/**
 * 長押ししてから上下に動かすと並べ替える（Notion の行の移動のような操作）
 * - 長押しの前に指が動いたら通常のスクロールとして扱う
 * - 並べ替え中はスクロールを止め、画面の端に近づくと自動でスクロールする
 */
export function useLongPressReorder(ids: string[], onMove: (id: string, toIndex: number) => void, enabled = true) {
  const els = useRef(new Map<string, HTMLElement>());
  const idsRef = useRef(ids);
  const onMoveRef = useRef(onMove);
  const st = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const startAutoScroll = useRef<() => void>(() => {});
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  // 並び順が画面に反映されたら、次の入れ替えを受け付ける
  const idsKey = ids.join(",");
  useEffect(() => {
    idsRef.current = idsKey ? idsKey.split(",") : [];
    if (st.current) st.current.pending = false;
  }, [idsKey]);

  const reposition = useCallback((clientY: number) => {
    const s = st.current;
    if (!s?.active) return;
    const el = els.current.get(s.id);
    if (!el) return;
    // 移動量（transform）を含まない、並び順どおりの位置
    const layoutTop = layoutTopOf(el);
    const desiredTop = clientY - s.grab;
    s.dy = desiredTop - layoutTop;
    setDrag({ id: s.id, dy: s.dy });
    if (s.pending) return;
    const list = idsRef.current;
    const idx = list.indexOf(s.id);
    // 指の位置が隣のカードの真ん中を越えたら入れ替える（開いていて背の高いカードでも同じ感覚で動かせる）
    const next = list[idx + 1] && els.current.get(list[idx + 1]);
    const prev = list[idx - 1] && els.current.get(list[idx - 1]);
    if (next) {
      const r = next.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) {
        s.pending = true;
        onMoveRef.current(s.id, idx + 1);
        return;
      }
    }
    if (prev) {
      const r = prev.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        s.pending = true;
        onMoveRef.current(s.id, idx - 1);
      }
    }
  }, []);

  useEffect(() => {
    const end = () => {
      const s = st.current;
      if (!s) return;
      if (s.timer) clearTimeout(s.timer);
      if (s.active) {
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
      }
      st.current = null;
      setDrag(null);
    };
    const move = (e: PointerEvent) => {
      const s = st.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (!s.active) {
        if (Math.abs(e.clientX - s.startX) > SLOP_PX || Math.abs(e.clientY - s.startY) > SLOP_PX) end();
        return;
      }
      s.lastY = e.clientY;
      reposition(e.clientY);
    };
    // 指が画面の端にある間はスクロールし続ける（指を止めていても）
    let raf = 0;
    const tick = () => {
      const s = st.current;
      if (!s?.active) {
        raf = 0;
        return;
      }
      const bottom = window.innerHeight - EDGE_BOTTOM_PX;
      const v = s.lastY < EDGE_TOP_PX ? -Math.ceil((EDGE_TOP_PX - s.lastY) / 6) - 2 : s.lastY > bottom ? Math.ceil((s.lastY - bottom) / 6) + 2 : 0;
      if (v) {
        window.scrollBy(0, v);
        reposition(s.lastY);
      }
      raf = requestAnimationFrame(tick);
    };
    startAutoScroll.current = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    // 並べ替え中はページのスクロールを止める
    const blockTouch = (e: TouchEvent) => {
      if (st.current?.active && e.cancelable) e.preventDefault();
    };
    const onScroll = () => {
      const s = st.current;
      if (s?.active) reposition(s.lastY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", blockTouch, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", blockTouch);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reposition]);

  /** カード全体に付ける（位置の計測と、ドラッグ中の見た目） */
  const itemProps = (id: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    style:
      drag?.id === id
        ? { transform: `translateY(${drag.dy}px) scale(1.02)`, zIndex: 40, position: "relative" as const, boxShadow: "0 12px 28px rgba(0,0,0,0.25)", transition: "box-shadow 120ms" }
        : drag
          ? { transition: "transform 150ms" }
          : undefined,
    "data-dragging": drag?.id === id ? "true" : undefined,
  });

  /** 長押しでつかむ部分（カードの見出し）に付ける */
  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      const el = els.current.get(id);
      if (!el) return;
      const s: DragState = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, grab: 0, dy: 0, pending: false, lastY: e.clientY };
      s.timer = setTimeout(() => {
        if (st.current !== s) return;
        s.active = true;
        s.grab = s.startY - layoutTopOf(el);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(10);
        setDrag({ id, dy: 0 });
        startAutoScroll.current();
      }, HOLD_MS);
      st.current = s;
    },
    // ドラッグ直後のタップ（開閉）を無視する
    onClickCapture: (e: React.MouseEvent) => {
      if (suppressClick.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    // 長押しで出る文字選択・メニューを出さない
    onContextMenu: (e: React.MouseEvent) => enabled && e.preventDefault(),
    style: enabled ? ({ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties) : undefined,
  });

  return { itemProps, handleProps, draggingId: drag?.id ?? null };
}
