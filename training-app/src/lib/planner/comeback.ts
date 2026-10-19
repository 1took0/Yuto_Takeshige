/**
 * 久しぶりのトレーニング（ブランク明け）の負荷調整
 * - チャットや当日のメモで「久しぶり」「2週間ぶり」「1か月休んでいた」などと伝えられたとき
 * - 伝えられなくても、前回のトレーニングから2週間以上空いているとき
 * 空いた期間が長いほど重量を下げ、長いときはセット数も減らす。重量は上げない。
 */

/** 何も言われなくても軽めにする空白の日数 */
export const AUTO_COMEBACK_DAYS = 14;

export interface Comeback {
  /** 空いた日数（分からなければ undefined） */
  days?: number;
  loadFactor: number;
  setsDelta: number;
  /** 説明 */
  label: string;
}

const UNIT_DAYS: Record<string, number> = { 日: 1, 週間: 7, 週: 7, か月: 30, ヶ月: 30, カ月: 30, ケ月: 30, ヵ月: 30, 月: 30, 年: 365 };

function toHalfWidth(s: string) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

/** 文から「久しぶり」かどうかと、空いた日数を読み取る。久しぶりの話でなければ null */
export function parseComeback(raw: string | undefined): { days?: number } | null {
  if (!raw) return null;
  const t = toHalfWidth(raw);
  const span = t.match(/(\d+(?:\.\d+)?|[一二三四五六七八九十半])\s*(日|週間|週|か月|ヶ月|カ月|ケ月|ヵ月|月|年)\s*(ぶり|振り|ほど|くらい|ぐらい)?(休|空|離|サボ|ぶり|振り|やって(い)?なかった|行って(い)?なかった|行けて(い)?なかった)/);
  const words = /久しぶり|久々|ひさびさ|ひさしぶり|ブランク|復帰|休んで(い)?た|サボって(い)?た|しばらく(やって|行って|行けて)(い)?なかった|間が空/.test(t);
  if (!span && !words) return null;
  if (!span) return {};
  const n = KANJI_NUM[span[1]] ?? Number(span[1]);
  const unit = UNIT_DAYS[span[2]] ?? 1;
  const days = Math.round(n * unit);
  return { days: days > 0 ? days : undefined };
}

/** 空いた日数に応じた下げ幅（日数が分からなければ、2週間程度とみなす） */
export function comebackAdjust(days: number | undefined): Comeback {
  const d = days ?? AUTO_COMEBACK_DAYS;
  const span = days === undefined ? "久しぶり" : days >= 30 ? `約${Math.round(days / 30)}か月ぶり` : days >= 14 ? `約${Math.round(days / 7)}週間ぶり` : `${days}日ぶり`;
  if (d >= 56) return { days, loadFactor: 0.65, setsDelta: -1, label: `${span}のため、重量を約35%下げてセット数も減らします` };
  if (d >= 28) return { days, loadFactor: 0.75, setsDelta: -1, label: `${span}のため、重量を約25%下げてセット数も減らします` };
  if (d >= 14) return { days, loadFactor: 0.85, setsDelta: 0, label: `${span}のため、重量を約15%下げます` };
  return { days, loadFactor: 0.9, setsDelta: 0, label: `${span}のため、重量を約10%下げます` };
}

/**
 * 今日のトレーニングを久しぶり扱いにするか
 * @param gapDays 前回のトレーニングからの日数（記録が無ければ undefined）
 * @param memo 当日のメモ（「久しぶり」などが書かれていれば優先）
 */
export function detectComeback(gapDays: number | undefined, memo?: string): Comeback | null {
  const said = parseComeback(memo);
  if (said) return comebackAdjust(said.days ?? (gapDays !== undefined && gapDays >= AUTO_COMEBACK_DAYS ? gapDays : undefined));
  if (gapDays !== undefined && gapDays >= AUTO_COMEBACK_DAYS) return comebackAdjust(gapDays);
  return null;
}
