import { ShareError } from "./service";

/**
 * 作成者（アプリ管理者）の確認
 * - 復元コード（環境変数 OWNER_RESTORE_CODE）を知っている人だけを作成者として扱う
 * - 未設定なら作成者向けの機能は存在しない扱い（404）
 */
export async function requireOwner(code: unknown): Promise<void> {
  const expected = process.env.OWNER_RESTORE_CODE;
  if (!expected) throw new ShareError(404, "この機能は設定されていません");
  const given = typeof code === "string" ? code.trim() : "";
  if (!given || !safeEqual(given, expected)) {
    // 総当たりを遅くする
    await new Promise((r) => setTimeout(r, 700));
    throw new ShareError(401, "復元コードが違います");
  }
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
