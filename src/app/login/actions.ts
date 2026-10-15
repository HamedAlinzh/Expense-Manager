"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminPassword } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSession, destroySession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import { log } from "@/lib/logger";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string };

const loginSchema = z.object({
  password: z.string().min(1).max(512),
  next: z.string().max(512).optional(),
});

const WINDOW_MS = 15 * 60 * 1000;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const e = env();
  if (!e.ADMIN_PASSWORD_HASH || !e.SESSION_SECRET) return { error: t("login.notConfigured") };

  const ip = clientIp(await headers());
  const perIp = rateLimit(`login:ip:${ip}`, 5, WINDOW_MS);
  const global = rateLimit("login:global", 30, WINDOW_MS);
  if (!perIp.ok || !global.ok) {
    const seconds = Math.max(perIp.retryAfterSeconds, global.retryAfterSeconds);
    log.warn("login rate limited", { ip });
    return { error: t("login.rateLimited", { seconds }) };
  }

  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: t("login.invalid") };

  if (!(await verifyAdminPassword(parsed.data.password))) {
    log.warn("login failed", { ip });
    return { error: t("login.invalid") };
  }

  resetRateLimit(`login:ip:${ip}`);
  await createSession();
  log.info("login succeeded", { ip });
  redirect(safeNextPath(parsed.data.next) as never);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
