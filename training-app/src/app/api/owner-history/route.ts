import { NextResponse } from "next/server";
import { buildSeedWorkouts } from "@/lib/seed/history";

/**
 * アプリ作成者の過去の記録（サーバー側だけに置き、復元コードを知っている人だけが取得できる）
 * - 環境変数 OWNER_RESTORE_CODE が未設定なら 404（機能自体が存在しない扱い）
 * - 記録データはクライアントの JavaScript に含めない
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.OWNER_RESTORE_CODE;
  if (!expected) return NextResponse.json({ error: "not found" }, { status: 404 });
  let code = "";
  try {
    code = String(((await req.json()) as { code?: string }).code ?? "");
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (code.trim() !== expected) {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "復元コードが違います" }, { status: 401 });
  }
  return NextResponse.json({ workouts: buildSeedWorkouts() });
}
