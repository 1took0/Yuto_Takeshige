import { NextResponse } from "next/server";
import { shareStatus } from "@/lib/share/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { enabled, reason } = shareStatus();
  return NextResponse.json({ enabled, reason });
}
