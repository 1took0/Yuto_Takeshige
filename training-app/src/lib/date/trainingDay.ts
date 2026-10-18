/**
 * トレーニング日の計算
 * - ユーザーの1日は午前6時〜翌午前6時（Asia/Tokyo）
 * - 例: 10/14 01:00 のトレーニングは 10/13 として扱う
 */
export const TZ = "Asia/Tokyo";
export const DAY_START_HOUR = 6;

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface TokyoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function tokyoParts(date: Date): TokyoParts {
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatYMD(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** YYYY-MM-DD を n 日ずらす（UTCで計算すればタイムゾーンの影響なし） */
export function shiftYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return formatYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** 指定時刻のトレーニング日（6時区切り） */
export function trainingDateOf(date: Date = new Date()): string {
  const p = tokyoParts(date);
  const ymd = formatYMD(p.year, p.month, p.day);
  return p.hour < DAY_START_HOUR ? shiftYMD(ymd, -1) : ymd;
}

/** 2つの YYYY-MM-DD の差（日） */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

/** トレーニング日 YYYY-MM-DD の開始時刻（東京 06:00）を ISO で返す（取り込みデータ用） */
export function trainingDayStartISO(ymd: string, hour = 10): string {
  // 東京は UTC+9 固定（夏時間なし）
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, 0, 0)).toISOString();
}

export function formatJaDate(ymd: string, withWeekday = true): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ["日", "月", "火", "水", "木", "金", "土"][dt.getUTCDay()];
  return withWeekday ? `${m}/${d}(${wd})` : `${y}/${m}/${d}`;
}

export function formatTimeHM(iso: string): string {
  const p = tokyoParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** 週の開始（月曜）YYYY-MM-DD */
export function weekStartOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const back = (dow + 6) % 7;
  return shiftYMD(ymd, -back);
}

export function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${pad(m)}:${pad(r)}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}分`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}時間${m}分` : `${h}時間`;
}
