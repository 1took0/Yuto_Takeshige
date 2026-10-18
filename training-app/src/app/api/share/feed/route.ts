import { NextResponse } from "next/server";
import { withShare } from "@/lib/share/server";
import { getFeed } from "@/lib/share/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return withShare(async (kv) => NextResponse.json(await getFeed(kv)));
}
