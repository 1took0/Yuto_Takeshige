import { NextResponse } from "next/server";
import { readJson, withShare } from "@/lib/share/server";
import { requireOwner } from "@/lib/share/owner";

export const dynamic = "force-dynamic";

/** 作成者の確認（アカウント整理の画面を開く前に復元コードを確かめる） */
export async function POST(req: Request) {
  return withShare(async () => {
    const body = (await readJson(req, 10_000)) as { code?: unknown };
    await requireOwner(body?.code);
    return NextResponse.json({ ok: true });
  });
}
