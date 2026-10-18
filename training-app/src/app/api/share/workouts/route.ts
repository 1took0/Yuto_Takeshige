import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withShare } from "@/lib/share/server";
import { CredsSchema } from "@/lib/share/sanitize";
import { deleteWorkouts, pruneWorkouts, putWorkouts, ShareError } from "@/lib/share/service";

const PutSchema = CredsSchema.extend({ workouts: z.array(z.unknown()).max(30) });
const DeleteSchema = CredsSchema.extend({ workoutIds: z.array(z.string().max(100)).max(200) });
const PruneSchema = CredsSchema.extend({ keepIds: z.array(z.string().max(100)).max(2000) });

/** 記録を追加・更新（最大30件/回） */
export async function PUT(req: Request) {
  return withShare(async (kv) => {
    const r = PutSchema.safeParse(await readJson(req));
    if (!r.success) throw new ShareError(400, "入力が正しくありません");
    return NextResponse.json(await putWorkouts(kv, r.data.userId, r.data.token, r.data.workouts));
  });
}

/** 記録を削除 */
export async function DELETE(req: Request) {
  return withShare(async (kv) => {
    const r = DeleteSchema.safeParse(await readJson(req));
    if (!r.success) throw new ShareError(400, "入力が正しくありません");
    await deleteWorkouts(kv, r.data.userId, r.data.token, r.data.workoutIds);
    return NextResponse.json({ ok: true });
  });
}

/** 端末に無い記録をサーバーから削除（全件同期） */
export async function POST(req: Request) {
  return withShare(async (kv) => {
    const r = PruneSchema.safeParse(await readJson(req));
    if (!r.success) throw new ShareError(400, "入力が正しくありません");
    return NextResponse.json({ removed: await pruneWorkouts(kv, r.data.userId, r.data.token, r.data.keepIds) });
  });
}
