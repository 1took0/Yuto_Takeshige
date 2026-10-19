import type { BodyRegion } from "@/lib/types";
import { findExerciseByText, REGION_WORDS, toHalfWidth } from "@/lib/coach/intents";
import type { WishOp } from "./index";

/**
 * 自由文の希望を解析する（ルールベース・APIキー不要）
 * 例：「次からスクワットはやりたくない」「今後は腕を多めにしたい」「有酸素はいらない」「いつも60分で」
 */

/** 今日だけでなく今後の希望として述べているか */
const STANDING = /今後|次から|次回から|次回以降|これから|以降|いつも|毎回|ずっと|普段|基本的?に|好き|嫌い|苦手|好み/;

const NEGATIVE = /やりたくない|したくない|嫌い|嫌だ|苦手|外して|入れないで|入れなくて|なしで|やめ(て|たい|る)|いらない|要らない|不要|避け/;
const POSITIVE = /やりたい|したい|好き|入れて|入れたい|増やし|もっと|多め|多く|重点|鍛えたい|強化/;
const LESS = /減らし|少なめ|少なく|控え|ほどほど|軽め|軽く/;

export function isStandingWish(text: string): boolean {
  return STANDING.test(text);
}

/** 文を「、」「。」などで区切り、それぞれから希望を取り出す */
export function parseWish(raw: string): WishOp[] {
  const ops: WishOp[] = [];
  const parts = toHalfWidth(raw)
    .split(/[。．\n、,，!！?？]|けど/)
    .map((s) => s.trim())
    .filter(Boolean);
  // 「スクワットは、やりたくない」のように対象と気持ちが分かれたら次の区切りとつなげて読む
  let carry = "";
  for (const p of parts) {
    const clause = carry + p;
    const found = parseClause(clause);
    if (found.length) {
      ops.push(...found);
      carry = "";
    } else carry = findSpecific(clause) || regionsIn(clause).length ? clause : "";
  }
  // 同じ対象への希望は最後のものを採用
  const seen = new Map<string, WishOp>();
  for (const op of ops) seen.set(keyOf(op), op);
  return [...seen.values()];
}

function keyOf(op: WishOp): string {
  switch (op.kind) {
    case "like_exercise":
    case "dislike_exercise":
      return `ex:${op.exerciseId}`;
    case "more_region":
    case "less_region":
      return `region:${op.region}`;
    default:
      return op.kind;
  }
}

function parseClause(t: string): WishOp[] {
  if (/足りない/.test(t) && !findSpecific(t)) return [{ kind: "intensity", value: "hard" }];
  // 有酸素
  if (/有酸素|ランニング|走|ウォーキング|歩き|トレッドミル/.test(t)) {
    if (/有酸素|トレッドミル/.test(t) && /(いらない|要らない|なし|無し|しない|やめ|不要|やりたくない)/.test(t)) return [{ kind: "cardio", value: "none" }];
    if (/(ランニング|走).*(やめ|なし|無し|しない|いらない|嫌|苦手|たくない)|ウォーキング(だけ|のみ|に|がいい)|歩き(だけ|のみ|がいい)/.test(t)) return [{ kind: "cardio", value: "walk" }];
    if (/(ランニング|走).*(したい|やりたい|入れて|好き|たい)|走りたい/.test(t)) return [{ kind: "cardio", value: "run" }];
  }
  // 器具
  if (/ダンベル/.test(t) && /(中心|メイン|多め|優先|がいい|増やし|好き)/.test(t) && !findSpecific(t)) return [{ kind: "equipment", value: "dumbbell" }];
  if (/マシン/.test(t) && /(中心|メイン|多め|優先|がいい|だけ|好き)/.test(t) && !findSpecific(t)) return [{ kind: "equipment", value: "machine" }];
  // 時間
  const time = t.match(/(\d+)\s*分/);
  if (time && /いつも|毎回|普段|基本|次から|今後|これから|くらい|ぐらい|程度/.test(t)) return [{ kind: "time", minutes: Number(time[1]) }];
  if (/時間(は|の)?制限(は)?なし|時間(は)?気にしない/.test(t)) return [{ kind: "time", minutes: null }];
  // 種目
  const ex = findSpecific(t);
  if (ex) {
    if (NEGATIVE.test(t)) return [{ kind: "dislike_exercise", exerciseId: ex }];
    if (POSITIVE.test(t)) return [{ kind: "like_exercise", exerciseId: ex }];
    return [];
  }
  // 部位
  const regions = regionsIn(t);
  if (regions.length) {
    if (NEGATIVE.test(t) || LESS.test(t)) return regions.map((region) => ({ kind: "less_region" as const, region }));
    if (POSITIVE.test(t)) return regions.map((region) => ({ kind: "more_region" as const, region }));
    return [];
  }
  // 強度
  if (/追い込|ハード|きつめ|しっかり|もっと(重|きつ)|物足りない/.test(t)) return [{ kind: "intensity", value: "hard" }];
  if (/軽め|楽に|ゆるめ|きつすぎ|無理なく|ほどほど/.test(t)) return [{ kind: "intensity", value: "light" }];
  if (/ふつう|普通|ちょうどいい/.test(t) && /強度|きつさ|負荷/.test(t)) return [{ kind: "intensity", value: "normal" }];
  return [];
}

function findSpecific(t: string): string | undefined {
  return findExerciseByText(t);
}

function regionsIn(t: string): BodyRegion[] {
  return REGION_WORDS.filter(([re]) => re.test(t)).map(([, r]) => r);
}
