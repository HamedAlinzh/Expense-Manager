"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { cards, settings } from "@/db/schema";
import { destroySession, requireSession, revokeAllSessions } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { defineAction, UserError } from "@/server/action-utils";
import { runBackup } from "@/server/jobs/backup";

const settingsSchema = z
  .object({
    displayUnit: z.enum(["toman", "thousand_toman", "rial"]),
    calendar: z.enum(["jalali", "gregorian"]),
    defaultCardId: idSchema.nullable(),
    dedupeWindowMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    transferWindowMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    notifyBudgetAlerts: z.boolean(),
    notifyRecurring: z.boolean(),
    notifyAnomalies: z.boolean(),
    notifyLowBalance: z.boolean(),
    weeklySummary: z.boolean(),
    monthlySummary: z.boolean(),
  })
  .partial();

export const updateSettings = defineAction(settingsSchema, async (patch) => {
  if (patch.defaultCardId) {
    const [c] = await db().select({ archived: cards.archived }).from(cards).where(eq(cards.id, patch.defaultCardId));
    if (!c) throw new UserError("Card not found");
    if (c.archived) throw new UserError("Pick an active card");
  }
  await db().update(settings).set(patch).where(eq(settings.id, 1));
});

/** Invalidates every session (all devices), including this one. */
export async function logoutEverywhere(): Promise<void> {
  await requireSession();
  await revokeAllSessions();
  await destroySession();
  redirect("/login");
}

/** Runs a pg_dump backup immediately (same as the nightly job). */
export const backupNow = defineAction(z.object({}), async () => {
  const file = await runBackup();
  if (!file) throw new UserError("pg_dump isn't available here — backups run inside the Docker container.");
  return { name: file.name, bytes: file.bytes };
});
