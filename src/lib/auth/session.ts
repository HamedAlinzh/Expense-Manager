import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySessionToken } from "./token";

async function currentSessionVersion(): Promise<number> {
  const [row] = await db().select({ v: settings.sessionVersion }).from(settings).where(eq(settings.id, 1));
  return row?.v ?? 1;
}

/** Data-access-layer check: valid signature AND not revoked via "log out everywhere". */
export const getSession = cache(async (): Promise<{ authenticated: boolean }> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySessionToken(token);
  if (!claims) return { authenticated: false };
  return { authenticated: claims.v === (await currentSessionVersion()) };
});

/** Call at the top of every protected page, Server Action and route handler. */
export async function requireSession(): Promise<void> {
  const { authenticated } = await getSession();
  if (!authenticated) redirect("/login");
}

export async function createSession(): Promise<void> {
  const token = await signSession({ v: await currentSessionVersion() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax (not Strict) so links from Telegram open logged-in; CSRF is covered by the proxy Origin check.
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function revokeAllSessions(): Promise<void> {
  const v = await currentSessionVersion();
  await db()
    .update(settings)
    .set({ sessionVersion: v + 1 })
    .where(eq(settings.id, 1));
}
