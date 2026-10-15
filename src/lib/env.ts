import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const csvIds = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isSafeInteger(n) && n > 0),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  TZ: z.string().default("Asia/Tehran"),

  ADMIN_PASSWORD_HASH: optionalString,
  SESSION_SECRET: optionalString.refine((v) => v === undefined || v.length >= 32, {
    message: "SESSION_SECRET must be at least 32 characters",
  }),

  INGEST_TOKEN: optionalString.refine((v) => v === undefined || v.length >= 24, {
    message: "INGEST_TOKEN must be at least 24 characters",
  }),

  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  TELEGRAM_ALLOWED_USER_IDS: csvIds,
  TELEGRAM_MODE: z.enum(["webhook", "polling", "off"]).default("off"),

  AI_PARSER_ENABLED: boolish,
  AI_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
  AI_API_KEY: optionalString,
  AI_MODEL: z.string().default("claude-opus-5-5"),

  MIGRATE_ON_START: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  SEED_ON_EMPTY: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => v !== "false" && v !== "0"),

  /** Log notifications instead of sending them to Telegram (development). */
  NOTIFY_DRY_RUN: boolish,

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated environment. Parsed lazily so `next build` works without a full `.env`. */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment variables:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
