/**
 * 区間切替の通知（音・振動）
 * - iOS Safari: AudioContext はユーザー操作後にしか再生できないため、
 *   タイマー開始ボタンのタップ時に unlock() を呼ぶ
 * - navigator.vibrate は iOS Safari 非対応（Android Chrome では動作）
 * - 画面スリープ中はどちらも保証されない → Wake Lock で画面を点灯維持する
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    // 無音を一瞬鳴らしてアンロック
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

export function beep(pattern: "segment" | "finish" | "rest" = "segment") {
  try {
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const tones = pattern === "finish" ? [880, 880, 1175] : pattern === "rest" ? [988] : [660, 880];
    const dur = pattern === "finish" ? 0.25 : 0.18;
    tones.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx!.currentTime + i * (dur + 0.07);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    });
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function supportsVibration(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

let wakeLock: WakeLockSentinel | null = null;
export async function requestWakeLock(): Promise<boolean> {
  try {
    if (!("wakeLock" in navigator)) return false;
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
    return true;
  } catch {
    return false;
  }
}
export function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
export function supportsWakeLock(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}
