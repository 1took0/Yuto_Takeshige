import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthEnabled, isPublicPath, isValidToken } from "@/lib/auth";

/**
 * アクセス保護（APP_PASSWORD が設定されている場合のみ）
 * 未ログインのページ遷移は /login へ、API は 401 を返す
 */
export async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const ok = await isValidToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ログインが必要です", code: "unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/).*)"],
};
