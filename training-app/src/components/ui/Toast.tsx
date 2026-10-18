"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<(message: string, kind?: Toast["kind"], action?: Toast["action"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((message: string, kind: Toast["kind"] = "info", action?: Toast["action"]) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 2500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-lg ${
              t.kind === "error" ? "bg-danger text-white" : t.kind === "success" ? "bg-success text-white" : "bg-fg text-bg"
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button className="tap rounded-lg bg-white/20 px-3 py-1 font-semibold" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
