import { NextResponse } from "next/server";
import { getKV, storeKind } from "./kv";
import { ShareError } from "./service";

/** 共有 API が使えるか（保存先が設定済み、かつアクセス保護あり） */
export function shareStatus(): { enabled: boolean; reason?: string; store: string } {
  const kind = storeKind();
  if (kind === "none") return { enabled: false, reason: "共有の保存先が設定されていません（管理者向け：README の「記録共有」を参照）", store: kind };
  if (!process.env.APP_PASSWORD && process.env.ALLOW_PUBLIC_SHARE !== "1") {
    return { enabled: false, reason: "記録共有にはアクセス保護（APP_PASSWORD）の設定が必要です", store: kind };
  }
  return { enabled: true, store: kind };
}

export async function withShare(fn: (kv: NonNullable<ReturnType<typeof getKV>>) => Promise<Response>): Promise<Response> {
  const st = shareStatus();
  if (!st.enabled) return NextResponse.json({ error: st.reason, code: "share_disabled" }, { status: 503 });
  try {
    return await fn(getKV()!);
  } catch (e) {
    if (e instanceof ShareError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("share api error", e);
    return NextResponse.json({ error: "共有サーバーでエラーが発生しました" }, { status: 500 });
  }
}

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ShareError(413, "送信データが大きすぎます");
  try {
    return JSON.parse(text);
  } catch {
    throw new ShareError(400, "invalid json");
  }
}
