"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgets, categories } from "@/db/schema";
import { idSchema, positiveRialSchema } from "@/lib/validation";
import { defineAction, UserError } from "@/server/action-utils";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const thresholdsSchema = z
  .array(z.number().int().min(10).max(200))
  .min(1)
  .max(5)
  .transform((t) => [...new Set(t)].sort((a, b) => a - b));

/** Sets a category's monthly budget from `month` onward (earlier months keep their own versions). */
export const setBudget = defineAction(
  z.object({ categoryId: idSchema, amountRial: positiveRialSchema, thresholds: thresholdsSchema, month: monthSchema }),
  async ({ categoryId, amountRial, thresholds, month }) => {
    const [cat] = await db().select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId));
    if (!cat) throw new UserError("Category not found");
    if (cat.kind !== "expense") throw new UserError("Budgets are for expense categories");
    await db()
      .insert(budgets)
      .values({ categoryId, amountRial, alertThresholds: thresholds, startsMonth: month, active: true })
      .onConflictDoUpdate({
        target: [budgets.categoryId, budgets.startsMonth],
        set: { amountRial, alertThresholds: thresholds, active: true, updatedAt: new Date() },
      });
  },
);

/** Stops a budget from `month` onward by adding an inactive version (history before stays intact). */
export const removeBudget = defineAction(
  z.object({ categoryId: idSchema, month: monthSchema }),
  async ({ categoryId, month }) => {
    const [latest] = await db()
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), sql`${budgets.startsMonth} <= ${month}`))
      .orderBy(desc(budgets.startsMonth))
      .limit(1);
    if (!latest) return;
    await db()
      .insert(budgets)
      .values({
        categoryId,
        amountRial: latest.amountRial,
        alertThresholds: latest.alertThresholds,
        startsMonth: month,
        active: false,
      })
      .onConflictDoUpdate({
        target: [budgets.categoryId, budgets.startsMonth],
        set: { active: false, updatedAt: new Date() },
      });
  },
);
