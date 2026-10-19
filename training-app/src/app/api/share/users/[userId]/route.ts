import { NextResponse } from "next/server";
import { readJson, withShare } from "@/lib/share/server";
import { adminRemoveUser, getUserWorkouts } from "@/lib/share/service";
import { requireOwner } from "@/lib/share/owner";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  return withShare(async (kv) => {
    const r = await getUserWorkouts(kv, userId);
    if (!r) return NextResponse.json({ error: "この利用者は共有していません" }, { status: 404 });
    return NextResponse.json(r);
  });
}

/** 作成者だけが、不要になったアカウント（共有プロフィールと記録）を削除できる */
export async function DELETE(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  return withShare(async (kv) => {
    const body = (await readJson(req, 10_000)) as { code?: unknown };
    await requireOwner(body?.code);
    const existed = await adminRemoveUser(kv, userId);
    return NextResponse.json({ ok: true, existed });
  });
}
