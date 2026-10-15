import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { isValidJalaliDate } from "@/lib/format/jalali";
import { formatDate, jalaliToUtc } from "@/lib/format/time";
import type { ParseResult } from "@/lib/ingest/parsers";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/logger";

/** What the model is asked to return (structured output, validated again below). */
const AiOutput = z.object({
  is_transaction: z.boolean(),
  type: z.enum(["expense", "income", "refund"]).nullable(),
  amount_rial: z.number().nullable(),
  jalali_date: z.string().nullable(),
  time: z.string().nullable(),
  identifier: z.string().nullable(),
  balance_after_rial: z.number().nullable(),
  description: z.string().nullable(),
  merchant: z.string().nullable(),
});

const SYSTEM = `You extract one bank transaction from an Iranian bank SMS or app notification.
Return is_transaction=false for anything that is not a completed debit or credit (ads, notices, failed transactions).
Rules:
- amount_rial and balance_after_rial are integers in Rial. Amounts without a unit are Rial; multiply Toman (تومان) by 10.
- type: "expense" for money leaving the account (برداشت, خرید, کسر, پرداخت), "income" for money arriving (واریز, سود), "refund" for reversals (برگشت).
- jalali_date as YYYY/MM/DD in the Solar Hijri calendar; resolve short or missing years using the received date. time as HH:MM (24h). Use null when absent.
- identifier: the account or masked card number exactly as written.
- description: a short Persian summary such as "خرید پایانه فروش". merchant: the shop or payee name if one is written, else null.`;

const amountOk = (n: number | null) => n !== null && Number.isSafeInteger(n) && n > 0;

/**
 * Fallback parser using the Claude API. Only called when AI_PARSER_ENABLED=true, the regular
 * parsers failed, and the message already passed the OTP filter and card-number masking.
 * Results are capped at 0.6 confidence so they always go to review.
 */
export async function aiParse(body: string, ctx: { receivedAt: Date; sender: string }): Promise<ParseResult | null> {
  const e = env();
  if (!e.AI_PARSER_ENABLED || !e.AI_API_KEY) return null;
  const client = new Anthropic({ apiKey: e.AI_API_KEY, timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: e.AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(AiOutput) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Received (Tehran time): ${formatDate(ctx.receivedAt, { time: true })}\nSender: ${ctx.sender}\n<message>\n${body}\n</message>`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      log.warn("ai parser refused", { category: response.stop_details?.category ?? null });
      return null;
    }
    const out = AiOutput.safeParse(response.parsed_output);
    if (!out.success || !out.data.is_transaction || !out.data.type || !amountOk(out.data.amount_rial)) return null;
    const r = out.data;

    let occurredAt = ctx.receivedAt;
    let occurredAtSource: ParseResult["occurredAtSource"] = "received";
    const dm = r.jalali_date ? /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(r.jalali_date) : null;
    const tm = r.time ? /^(\d{1,2}):(\d{2})$/.exec(r.time) : null;
    if (dm && isValidJalaliDate(+dm[1]!, +dm[2]!, +dm[3]!)) {
      occurredAt = jalaliToUtc({
        jy: +dm[1]!,
        jm: +dm[2]!,
        jd: +dm[3]!,
        hour: tm ? +tm[1]! % 24 : 12,
        minute: tm ? +tm[2]! % 60 : 0,
      });
      occurredAtSource = "message";
    }
    return {
      parser: `ai:${response.model}`,
      bank: null,
      type: r.type!,
      amountRial: r.amount_rial!,
      occurredAt,
      occurredAtSource,
      identifier: r.identifier?.slice(0, 40) ?? null,
      balanceAfterRial:
        r.balance_after_rial !== null && Number.isSafeInteger(r.balance_after_rial) ? r.balance_after_rial : null,
      description: (r.description ?? "").slice(0, 200),
      merchant: r.merchant?.slice(0, 80) ?? null,
      confidence: 0.6,
      notes: ["parsed by AI — please review"],
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) log.warn("ai parser rate limited");
    else if (err instanceof Anthropic.APIError) log.warn("ai parser api error", { status: err.status });
    else log.warn("ai parser failed", { error: errorMessage(err) });
    return null;
  }
}
