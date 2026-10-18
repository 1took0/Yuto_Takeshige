import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { CoachRequestSchema, CoachResponseSchema } from "@/lib/ai/schema";
import { buildSystemPrompt } from "@/lib/ai/prompt";

/**
 * Claude AI コーチ（サーバー側）
 * - API キーは環境変数 ANTHROPIC_API_KEY としてサーバーでのみ扱う（ブラウザには渡さない）
 * - 未設定の場合は 503 を返し、クライアントはルールベースにフォールバックする
 * - 返答は構造化出力（JSON スキーマ）で受け取り、クライアント側で予定にのみ適用する
 */
export const runtime = "nodejs";

const MODEL = process.env.COACH_MODEL || "claude-opus-5-5";

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_API_KEY ? MODEL : null });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY が設定されていません", code: "no_api_key" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = CoachRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  const { messages, context } = parsed.data;

  const client = new Anthropic();
  const contextText = `## 今日の状況（${context.today}）\n店舗: ${context.storeName ?? "未定"}\n利用可能な種目ID: ${context.availableExerciseIds.join(", ")}\n\n## 進行中のワークアウト（予定と実績。completed=true のセットは実績）\n${JSON.stringify(context.workout) ?? "なし"}\n\n## 直近の履歴（新しい順、要約）\n${JSON.stringify(context.recentHistory)}`;

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: [
        { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } },
        { type: "text", text: contextText },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { format: zodOutputFormat(CoachResponseSchema), effort: "low" },
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "モデルが応答を拒否しました", code: "refusal" }, { status: 502 });
    }
    const out = response.parsed_output;
    if (!out) return NextResponse.json({ error: "構造化出力の解析に失敗しました" }, { status: 502 });
    return NextResponse.json({ ...out, model: response.model, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, cacheRead: response.usage.cache_read_input_tokens ?? 0 } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "API キーが無効です", code: "auth" }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "レート制限中です。少し待ってから再試行してください", code: "rate_limit" }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `API エラー (${e.status}): ${e.message}`, code: "api" }, { status: 502 });
    console.error(e);
    return NextResponse.json({ error: "不明なエラー" }, { status: 500 });
  }
}
