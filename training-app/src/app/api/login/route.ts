import { NextResponse } from "next/server";
import { AUTH_COOKIE, isAuthEnabled, tokenFor } from "@/lib/auth";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function GET() {
  return NextResponse.json({ enabled: isAuthEnabled() });
}

/** パスワードを検証して Cookie を発行する */
export async function POST(req: Request) {
  if (!isAuthEnabled()) return NextResponse.json({ ok: true, enabled: false });
  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (password !== process.env.APP_PASSWORD) {
    // 総当たりを遅らせる
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, enabled: true });
  res.cookies.set(AUTH_COOKIE, await tokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}

/** ログアウト */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
