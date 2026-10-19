"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveWorkout } from "@/components/workout/ActiveWorkoutProvider";
import { useSettings } from "@/hooks/useSettings";
import { respond, type CoachReply, type Intent } from "@/lib/coach/intents";
import type { WishOp } from "@/lib/preferences";
import { applyPlanPatch } from "@/lib/coach/applyPatch";
import { listCompletedWorkouts, listStoreEquipment, saveWish } from "@/lib/db/repo";
import { respondToWish } from "@/lib/coach/wish";
import { availableExercises } from "@/lib/planner";

/**
 * トレーニングの調整（ルールベース・完全無料）
 * 選択肢から選んだ相談に応じて、進行中メニューの「予定」だけを変更する（自由入力は使わない）。外部 API は使わない。
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  applied?: string[];
  skipped?: string[];
}

const STORAGE_KEY = "tc.adjust.messages";

export function useAdjust() {
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

  /**
   * 選択肢から選んだ相談を実行する（自由入力はしない）
   * - intent：今日のメニューの調整（残り時間・疲れ・マシンなど）
   * - wish：今後のメニューへの希望（この種目は外したい など）
   */
  const choose = useCallback(
    async (label: string, action: { intent: Intent } | { wish: WishOp[] }) => {
      if (busy) return;
      setBusy(true);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: label }]);
      try {
        if ("wish" in action) {
          await saveWish(label, action.wish);
          setMessages((m) => [...m, applyReply(respondToWish(action.wish, workout))]);
          return;
        }
        const [history, equipment] = await Promise.all([listCompletedWorkouts(), listStoreEquipment()]);
        const storeId = workout?.storeId ?? settings.lastStoreId ?? "ichijoji";
        const availableIds = new Set(availableExercises(equipment, storeId, settings.excludedExerciseIds).map((a) => a.def.id));
        setMessages((m) => [...m, applyReply(respond(action.intent, workout, { history, availableIds }))]);
      } finally {
        setBusy(false);
      }
    },
    [busy, workout, settings, applyReply],
  );

  const clear = () => setMessages([]);
  return { messages, choose, busy, clear, hasWorkout: !!workout, workout };
}
