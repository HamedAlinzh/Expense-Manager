import { webhookCallback } from "grammy";
import { env } from "@/lib/env";
import { tokenMatches } from "@/lib/ingest/request";
import { log } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getBot } from "@/server/telegram/runtime";

export const dynamic = "force-dynamic";

let handler: ((req: Request) => Promise<Response>) | null = null;

/** Telegram → app. Verified by the secret token Telegram echoes in X-Telegram-Bot-Api-Secret-Token. */
export async function POST(req: Request) {
  const limited = rateLimit(`tg:ip:${clientIp(req.headers)}`, 120, 60_000);
  if (!limited.ok) return new Response("rate limited", { status: 429 });

  const e = env();
  const bot = getBot();
  if (e.TELEGRAM_MODE !== "webhook" || !bot || !e.TELEGRAM_WEBHOOK_SECRET)
    return new Response("not found", { status: 404 });
  if (!tokenMatches(req.headers.get("x-telegram-bot-api-secret-token"), e.TELEGRAM_WEBHOOK_SECRET)) {
    log.warn("telegram: webhook secret mismatch");
    return new Response("unauthorized", { status: 401 });
  }
  handler ??= webhookCallback(bot, "std/http", {
    secretToken: e.TELEGRAM_WEBHOOK_SECRET,
    onTimeout: "return",
    timeoutMilliseconds: 9_000,
  });
  return handler(req);
}
