import { z } from "zod";
import { hexColorSchema, rialSchema, stringListSchema } from "@/lib/validation";

const FULL_CARD_NUMBER = /\d{16}/;

const daySchema = z.number().int().min(1).max(31).nullable();

export const cardInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(40),
    bank: z.enum(["sepah", "mellat", "tejarat", "blu", "other"]),
    color: hexColorSchema,
    cardType: z.enum(["debit", "credit"]),
    aliases: stringListSchema(20, 40),
    identifierFragments: stringListSchema(20, 40).refine(
      (list) => list.every((f) => !FULL_CARD_NUMBER.test(f.replace(/[\s-]/g, ""))),
      "Don't store full card numbers — use the last 4 digits or the masked form from your SMS",
    ),
    smsSenderIds: stringListSchema(20, 100),
    /** Signed: a credit card balance can be negative. */
    lastKnownBalanceRial: z.number().int().safe().nullable(),
    lowBalanceThresholdRial: rialSchema.nullable(),
    creditLimitRial: rialSchema.nullable(),
    statementDay: daySchema,
    dueDay: daySchema,
  })
  .transform((c) => (c.cardType === "debit" ? { ...c, creditLimitRial: null, statementDay: null, dueDay: null } : c));

export type CardInput = z.input<typeof cardInputSchema>;

export const BANK_LABELS: Record<CardInput["bank"], { en: string; fa: string }> = {
  sepah: { en: "Sepah", fa: "سپه" },
  mellat: { en: "Mellat", fa: "ملت" },
  tejarat: { en: "Tejarat", fa: "تجارت" },
  blu: { en: "Blu", fa: "بلو" },
  other: { en: "Other", fa: "سایر" },
};
