import { NextResponse } from "next/server";
import { readJson, withShare } from "@/lib/share/server";
import { CredsSchema, DisplayNameSchema } from "@/lib/share/sanitize";
import { removeUser, ShareError, upsertProfile } from "@/lib/share/service";

const PutSchema = CredsSchema.extend({ displayName: DisplayNameSchema });

/** 共有を開始・表示名を更新 */
export async function PUT(req: Request) {
  return withShare(async (kv) => {
    const r = PutSchema.safeParse(await readJson(req));
    if (!r.success) throw new ShareError(400, "入力が正しくありません");
    const p = await upsertProfile(kv, r.data.userId, r.data.token, r.data.displayName);
    return NextResponse.json({ ok: true, displayName: p.displayName });
  });
}

/** 共有をやめる（サーバー上の記録を全削除） */
export async function DELETE(req: Request) {
  return withShare(async (kv) => {
    const r = CredsSchema.safeParse(await readJson(req));
    if (!r.success) throw new ShareError(400, "入力が正しくありません");
    await removeUser(kv, r.data.userId, r.data.token);
    return NextResponse.json({ ok: true });
  });
}

