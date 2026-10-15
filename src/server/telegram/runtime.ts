import "server-only";
import type { Bot, InlineKeyboard } from "grammy";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/logger";
import { BOT_COMMANDS, createBot } from "./bot";

const g = globalThis as unknown as { __bot?: Bot; __botStarted?: boolean };

/** The bot singleton, or null when Telegram isn't configured. */
export function getBot(): Bot | null {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN || e.TELEGRAM_ALLOWED_USER_IDS.length === 0) return null;
  g.__bot ??= createBot(e.TELEGRAM_BOT_TOKEN, e.TELEGRAM_ALLOWED_USER_IDS);
  return g.__bot;
}

export function webhookUrl(): string {
  return new URL("/api/telegram/webhook", env().APP_URL).toString();
}

/**
 * Called once at server start. polling: long-polls Telegram (local development).
 * webhook: registers APP_URL/api/telegram/webhook with the secret token (production).
 */
export async function startTelegram(): Promise<void> {
  const e = env();
  if (e.TELEGRAM_MODE === "off") return;
  const bot = getBot();
  if (!bot) {
    log.warn("telegram: TELEGRAM_MODE is set but TELEGRAM_BOT_TOKEN / TELEGRAM_ALLOWED_USER_IDS are missing");
    return;
  }
  if (g.__botStarted) return;
  g.__botStarted = true;

  try {
    await bot.api.setMyCommands(BOT_COMMANDS);
  } catch (err) {
    log.warn("telegram: setMyCommands failed", { error: errorMessage(err) });
  }

  if (e.TELEGRAM_MODE === "polling") {
    // bot.start() removes any webhook first; it runs until the process exits.
    void bot
      .start({
        allowed_updates: ["message", "callback_query"],
        onStart: (me) => log.info("telegram: polling started", { bot: me.username }),
      })
      .catch((err) => {
        g.__botStarted = false;
        log.error("telegram: polling stopped", { error: errorMessage(err) });
      });
    return;
  }

  if (!e.TELEGRAM_WEBHOOK_SECRET) {
    log.error("telegram: TELEGRAM_WEBHOOK_SECRET is required in webhook mode");
    return;
  }
  try {
    await bot.api.setWebhook(webhookUrl(), {
      secret_token: e.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    log.info("telegram: webhook registered", { url: webhookUrl() });
  } catch (err) {
    log.error("telegram: setWebhook failed", { error: errorMessage(err) });
  }
}

/** Sends a message to every allowed user (alerts, summaries). Returns true if at least one send worked. */
export async function notifyOwner(html: string, keyboard?: InlineKeyboard): Promise<boolean> {
  const bot = getBot();
  if (!bot) return false;
  let ok = false;
  for (const id of env().TELEGRAM_ALLOWED_USER_IDS) {
    try {
      await bot.api.sendMessage(id, html, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
      ok = true;
    } catch (err) {
      log.warn("telegram: notify failed", { error: errorMessage(err) });
    }
  }
  return ok;
}
