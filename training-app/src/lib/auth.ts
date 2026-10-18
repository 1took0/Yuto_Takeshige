/**
 * 簡易アクセス保護（共有パスワード）
 * - サーバー環境変数 APP_PASSWORD が設定されているときだけ有効
 * - Cookie には パスワード本体ではなく SHA-256 ハッシュ（ソルト付き）を保存
 * - 個人利用の PWA を無料ホスティングで公開する際に、第三者の利用を防ぐ目的
 */
export const AUTH_COOKIE = "tc_auth";
const SALT = "training-coach-auth-v1";

export function isAuthEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  const pw = process.env.APP_PASSWORD;
  if (!pw || !token) return false;
  const expected = await tokenFor(pw);
  if (expected.length !== token.length) return false;
  // タイミング攻撃対策の定数時間比較
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** 保護対象外のパス（PWA のインストールに必要なものと認証関連） */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  );
}
