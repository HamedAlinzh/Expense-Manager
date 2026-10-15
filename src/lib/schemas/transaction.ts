import { z } from "zod";
import { parseDayKey } from "@/lib/format/time";
import { idSchema, positiveRialSchema, rialSchema, tagListSchema } from "@/lib/validation";

export const TX_TYPES = ["expense", "income", "transfer", "refund"] as const;
export const TX_SOURCES = ["manual", "csv", "sms", "notification", "telegram"] as const;
export const TX_STATUSES = ["pending_review", "confirmed"] as const;
export type TxType = (typeof TX_TYPES)[number];
export type TxSource = (typeof TX_SOURCES)[number];
export type TxStatus = (typeof TX_STATUSES)[number];

export const TYPE_LABELS: Record<TxType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  refund: "Refund",
};
export const SOURCE_LABELS: Record<TxSource, string> = {
  manual: "Manual",
  csv: "Import",
  sms: "SMS",
  notification: "Notification",
  telegram: "Telegram",
};

/** Money leaving (`out`) or arriving (`in`) for non-transfer types. */
export function directionOf(type: Exclude<TxType, "transfer">): "in" | "out" {
  return type === "expense" ? "out" : "in";
}

// ─── Filters (URL ⇄ object) ─────────────────────────────────────────────────

export type TxFilters = {
  q?: string;
  from?: string;
  to?: string;
  cards: number[];
  /** 0 means "uncategorized". */
  categories: number[];
  types: TxType[];
  tags: string[];
  minRial?: number;
  maxRial?: number;
  status?: TxStatus;
  sources: TxSource[];
  page: number;
};

export const emptyFilters: TxFilters = { cards: [], categories: [], types: [], tags: [], sources: [], page: 1 };

type ParamsLike = { get(name: string): string | null };

const list = (v: string | null) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
const ids = (v: string | null) =>
  list(v)
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n >= 0);
const oneOf = <T extends string>(allowed: readonly T[], v: string) => (allowed as readonly string[]).includes(v);
const rialParam = (v: string | null) => {
  if (!v || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
};
const dayParam = (v: string | null) => (v && parseDayKey(v) ? v : undefined);

/** Parses filters from URL search params. Unknown or malformed values are dropped, never thrown. */
export function parseFilters(params: ParamsLike): TxFilters {
  const page = Number(params.get("page"));
  const status = params.get("status");
  return {
    q: params.get("q")?.trim().slice(0, 100) || undefined,
    from: dayParam(params.get("from")),
    to: dayParam(params.get("to")),
    cards: ids(params.get("card")),
    categories: ids(params.get("category")),
    types: list(params.get("type")).filter((t): t is TxType => oneOf(TX_TYPES, t)),
    tags: list(params.get("tag"))
      .map((t) => t.toLowerCase())
      .slice(0, 10),
    minRial: rialParam(params.get("min")),
    maxRial: rialParam(params.get("max")),
    status: status && oneOf(TX_STATUSES, status) ? (status as TxStatus) : undefined,
    sources: list(params.get("source")).filter((s): s is TxSource => oneOf(TX_SOURCES, s)),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

/** Inverse of parseFilters. Omits defaults so URLs stay short. */
export function filtersToParams(f: TxFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.cards.length) p.set("card", f.cards.join(","));
  if (f.categories.length) p.set("category", f.categories.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.tags.length) p.set("tag", f.tags.join(","));
  if (f.minRial !== undefined) p.set("min", String(f.minRial));
  if (f.maxRial !== undefined) p.set("max", String(f.maxRial));
  if (f.status) p.set("status", f.status);
  if (f.sources.length) p.set("source", f.sources.join(","));
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

export function activeFilterCount(f: TxFilters): number {
  return (
    (f.q ? 1 : 0) +
    (f.from || f.to ? 1 : 0) +
    (f.cards.length ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.types.length ? 1 : 0) +
    (f.tags.length ? 1 : 0) +
    (f.minRial !== undefined || f.maxRial !== undefined ? 1 : 0) +
    (f.status ? 1 : 0) +
    (f.sources.length ? 1 : 0)
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────

const dayKeySchema = z.string().refine((v) => parseDayKey(v) !== null, "Pick a date");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const commonFields = {
  amountRial: positiveRialSchema,
  date: dayKeySchema,
  time: timeSchema,
  description: z.string().trim().max(300),
  tags: tagListSchema,
  note: z.string().trim().max(2000).nullable(),
};

export const createTransactionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["expense", "income", "refund"]),
    cardId: idSchema.nullable(),
    categoryId: idSchema.nullable(),
    merchant: z.string().trim().max(120).nullable(),
    ...commonFields,
  }),
  z
    .object({
      type: z.literal("transfer"),
      fromCardId: idSchema,
      toCardId: idSchema,
      ...commonFields,
    })
    .refine((t) => t.fromCardId !== t.toCardId, { path: ["toCardId"], message: "Pick two different cards" }),
]);
export type CreateTransactionInput = z.input<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  id: idSchema,
  patch: z
    .object({
      type: z.enum(["expense", "income", "refund"]),
      amountRial: positiveRialSchema,
      date: dayKeySchema,
      time: timeSchema,
      cardId: idSchema.nullable(),
      categoryId: idSchema.nullable(),
      description: z.string().trim().max(300),
      merchant: z.string().trim().max(120).nullable(),
      tags: tagListSchema,
      note: z.string().trim().max(2000).nullable(),
      status: z.enum(TX_STATUSES),
    })
    .partial(),
});
export type UpdateTransactionInput = z.input<typeof updateTransactionSchema>;

export const splitsSchema = z.object({
  id: idSchema,
  splits: z
    .array(
      z.object({
        categoryId: idSchema.nullable(),
        amountRial: positiveRialSchema,
        note: z.string().trim().max(200).nullable(),
      }),
    )
    .max(20),
});

export const bulkUpdateSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("category"), categoryId: idSchema.nullable() }),
    z.object({ kind: z.literal("addTags"), tags: tagListSchema }),
    z.object({ kind: z.literal("removeTags"), tags: tagListSchema }),
    z.object({ kind: z.literal("confirm") }),
    z.object({ kind: z.literal("delete") }),
  ]),
});
export type BulkAction = z.input<typeof bulkUpdateSchema>["action"];

export const savedViewSchema = z.object({ name: z.string().trim().min(1).max(40), query: z.string().max(2000) });

export { rialSchema };
