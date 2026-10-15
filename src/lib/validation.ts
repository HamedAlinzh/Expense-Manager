import { z } from "zod";

/** Integer Rial, non-negative, within the exact range of JS numbers. */
export const rialSchema = z
  .number({ message: "Enter an amount" })
  .int("Amount must be whole Rial")
  .nonnegative("Amount can't be negative")
  .max(Number.MAX_SAFE_INTEGER, "Amount is too large");

export const positiveRialSchema = rialSchema.refine((v) => v > 0, "Amount must be greater than zero");

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a color");

export const idSchema = z.number().int().positive();

/** Trimmed, de-duplicated, non-empty strings (for aliases, sender IDs, tags…). */
export const stringListSchema = (max = 50, maxLen = 100) =>
  z
    .array(z.string().trim().min(1).max(maxLen))
    .max(max)
    .transform((list) => [...new Set(list)]);

export const tagListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(40)
      .transform((t) => t.replace(/^#/, "").toLowerCase()),
  )
  .max(20)
  .transform((list) => [...new Set(list)].filter(Boolean));
