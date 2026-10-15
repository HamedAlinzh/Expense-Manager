import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { type Settings, settings } from "@/db/schema";
import type { Prefs } from "@/lib/prefs";

export const getSettings = cache(async (): Promise<Settings> => {
  const [row] = await db().select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db().insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db().select().from(settings).where(eq(settings.id, 1));
  return again!;
});

export async function getPrefs(): Promise<Prefs> {
  const s = await getSettings();
  return { unit: s.displayUnit, calendar: s.calendar, digits: "latin" };
}
