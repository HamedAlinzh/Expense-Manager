"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { recurringSeries } from "@/db/schema";
import { idSchema } from "@/lib/validation";
import { defineAction } from "@/server/action-utils";
import { runRecurringDetection } from "@/server/jobs/recurring";
import { withLock } from "@/server/jobs/runner";

export const setRecurringStatus = defineAction(
  z.object({ id: idSchema, status: z.enum(["detected", "confirmed", "dismissed"]) }),
  async ({ id, status }) => {
    await db().update(recurringSeries).set({ status }).where(eq(recurringSeries.id, id));
  },
);

export const rescanRecurring = defineAction(z.object({}), async () => {
  const res = await withLock("recurring", () => runRecurringDetection());
  return res ?? { series: 0, alerts: 0 };
});
