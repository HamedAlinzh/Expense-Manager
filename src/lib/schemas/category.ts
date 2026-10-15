import { z } from "zod";
import { CATEGORY_ICON_NAMES } from "@/lib/category-icons";
import { validatePattern } from "@/lib/rules";
import { hexColorSchema, idSchema } from "@/lib/validation";

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  kind: z.enum(["expense", "income"]),
  icon: z.string().refine((v) => CATEGORY_ICON_NAMES.includes(v), "Pick an icon"),
  color: hexColorSchema,
  parentId: idSchema.nullable(),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const ruleInputSchema = z
  .object({
    matchField: z.enum(["merchant", "description", "raw_text"]),
    matchType: z.enum(["contains", "regex", "equals"]),
    pattern: z.string().trim(),
    categoryId: idSchema,
    setType: z.enum(["expense", "income", "transfer", "refund"]).nullable(),
    priority: z.number().int().min(0).max(100_000),
    enabled: z.boolean(),
  })
  .superRefine((r, ctx) => {
    const err = validatePattern(r.matchType, r.pattern);
    if (err) ctx.addIssue({ code: "custom", path: ["pattern"], message: err });
  });
export type RuleInput = z.input<typeof ruleInputSchema>;

export const RULE_FIELD_LABELS = { merchant: "Merchant", description: "Description", raw_text: "SMS text" } as const;
export const RULE_MATCH_LABELS = { contains: "contains", equals: "equals", regex: "matches regex" } as const;
