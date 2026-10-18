import { beep as rawBeep, vibrate } from "@/lib/timer/notify";

export function markNotifiedAndNotify(kind: "segment" | "finish" | "rest", opts: { sound: boolean; vibration: boolean }) {
  if (opts.sound) rawBeep(kind);
  if (opts.vibration) vibrate(kind === "finish" ? [300, 100, 300, 100, 300] : [200, 100, 200]);
}
export const beep = rawBeep;
