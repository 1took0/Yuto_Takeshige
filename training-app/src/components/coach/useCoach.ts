"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveWorkout } from "@/components/workout/ActiveWorkoutProvider";
import { useSettings } from "@/hooks/useSettings";
import { parseIntent, respond, type CoachReply } from "@/lib/coach/intents";
import { applyPlanPatch } from "@/lib/coach/applyPatch";
import { listCompletedWorkouts, listStoreEquipment } from "@/lib/db/repo";
import { availableExercises } from "@/lib/planner";
import { storeName } from "@/lib/catalog/stores";
import { trainingDateOf } from "@/lib/date/trainingDay";
import type { PlanPatch, Workout } from "@/lib/types";
import type { CoachResponse } from "@/lib/ai/schema";
import { countedSets } from "@/lib/planner/history";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "rule" | "claude";
  applied?: string[];
  skipped?: string[];
  pendingPatch?: PlanPatch;
}

const STORAGE_KEY = "tc.coach.messages";

function summarizeHistory(ws: Workout[]) {
  return ws.slice(0, 8).map((w) => ({
    date: w.trainingDate,
    store: w.storeId,
    exercises: w.exercises.map((e) => ({
      id: e.exerciseId,
      sets: countedSets(e).map((s) => ({ w: s.weight, reps: s.actualReps, sec: s.actualSeconds ?? s.seconds, L: s.left?.weight, R: s.right?.weight })),
    })),
    cardio: w.cardio.map((c) => ({ machine: c.machine, actual: c.actual })),
  }));
}

export function useCoach() {
  const { workout, mutate } = useActiveWorkout();
  const { settings } = useSettings();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "rule">("auto");

  useEffect(() => {
    // 会話はタブ内で保持（SSR とのハイドレーション不一致を避けるためマウント後に読み込む）
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    fetch("/api/coach")
      .then((r) => r.json())
      .then((j) => {
        setAiEnabled(!!j.enabled);
        setAiModel(j.model ?? null);
      })
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  const applyReply = useCallback(
    (reply: CoachReply, source: ChatMessage["source"]): ChatMessage => {
      const msg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: reply.message, source };
      if (reply.patch && workout) {
        const r = applyPlanPatch(workout, reply.patch);
        if (r.applied.length) mutate(() => r.workout);
        msg.applied = r.applied;
        msg.skipped = r.skipped;
      }
      if (reply.navigate) router.push(reply.navigate);
      return msg;
    },
    [workout, mutate, router],
  );

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setBusy(true);
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: t };
      setMessages((m) => [...m, userMsg]);
      try {
        const [history, equipment] = await Promise.all([listCompletedWorkouts(), listStoreEquipment()]);
        const storeId = workout?.storeId ?? settings.lastStoreId ?? "ichijoji";
        const availableIds = new Set(availableExercises(equipment, storeId, settings.excludedExerciseIds).map((a) => a.def.id));
        const intent = parseIntent(t, workout);

        // ルールで確実に解釈できるもの（開始など）はAPIを使わない
        const useClaude = aiEnabled && mode === "auto" && intent.type !== "start_session";
        if (useClaude) {
          try {
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [...messages.slice(-10), userMsg].map((m) => ({ role: m.role, content: m.content })),
                context: {
                  today: trainingDateOf(),
                  workout,
                  recentHistory: summarizeHistory(history),
                  availableExerciseIds: [...availableIds],
                  storeName: storeName(storeId),
                },
              }),
            });
            if (res.ok) {
              const j = (await res.json()) as CoachResponse;
              const reply: CoachReply = {
                message: j.message,
                patch: j.ops.length ? { message: "Claude の提案", ops: j.ops.map(stripNulls) as PlanPatch["ops"] } : undefined,
                navigate: j.navigateToStart ? "/start" : undefined,
              };
              setMessages((m) => [...m, applyReply(reply, "claude")]);
              return;
            }
            const err = await res.json().catch(() => ({}));
            if (res.status !== 503) {
              setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `Claude に接続できませんでした（${err.error ?? res.status}）。ルールベースで応答します。`, source: "rule" }]);
            }
          } catch {
            /* ネットワークエラー → ルールベースへ */
          }
        }
        const reply = respond(intent, workout, { history, availableIds });
        setMessages((m) => [...m, applyReply(reply, "rule")]);
      } finally {
        setBusy(false);
      }
    },
    [busy, workout, settings, aiEnabled, mode, messages, applyReply],
  );

  const clear = () => setMessages([]);
  return { messages, send, busy, aiEnabled, aiModel, mode, setMode, clear, hasWorkout: !!workout };
}

function stripNulls<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null) continue;
    if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === "object" ? stripNulls(x as Record<string, unknown>) : x));
    else out[k] = v;
  }
  return out as T;
}
