"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveWorkout } from "@/components/workout/ActiveWorkoutProvider";
import { useSettings } from "@/hooks/useSettings";
import { parseIntent, respond, type CoachReply } from "@/lib/coach/intents";
import { applyPlanPatch } from "@/lib/coach/applyPatch";
import { listCompletedWorkouts, listStoreEquipment } from "@/lib/db/repo";
import { availableExercises } from "@/lib/planner";

/**
 * コーチ（ルールベース・完全無料）
 * 入力文から意図を解析し、進行中メニューの「予定」だけを変更する。外部 API は使わない。
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  applied?: string[];
  skipped?: string[];
}

const STORAGE_KEY = "tc.coach.messages";

export function useCoach() {
  const { workout, mutate } = useActiveWorkout();
  const { settings } = useSettings();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  const applyReply = useCallback(
    (reply: CoachReply): ChatMessage => {
      const msg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: reply.message };
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
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: t }]);
      try {
        const [history, equipment] = await Promise.all([listCompletedWorkouts(), listStoreEquipment()]);
        const storeId = workout?.storeId ?? settings.lastStoreId ?? "ichijoji";
        const availableIds = new Set(availableExercises(equipment, storeId, settings.excludedExerciseIds).map((a) => a.def.id));
        const reply = respond(parseIntent(t, workout), workout, { history, availableIds });
        setMessages((m) => [...m, applyReply(reply)]);
      } finally {
        setBusy(false);
      }
    },
    [busy, workout, settings, applyReply],
  );

  const clear = () => setMessages([]);
  return { messages, send, busy, clear, hasWorkout: !!workout };
}
