import { NextResponse } from "next/server";
import { withShare } from "@/lib/share/server";
import { getUserWorkouts } from "@/lib/share/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  return withShare(async (kv) => {
    const r = await getUserWorkouts(kv, userId);
    if (!r) return NextResponse.json({ error: "この利用者は共有していません" }, { status: 404 });
    return NextResponse.json(r);
  });
}
