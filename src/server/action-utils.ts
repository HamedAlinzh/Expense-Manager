import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { errorMessage, log } from "@/lib/logger";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Thrown inside handlers for errors that are safe to show to the user. */
export class UserError extends Error {}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
    // Update actions nest fields under `data`/`patch`; expose the bare field name for forms too.
    const [head, ...rest] = issue.path;
    if ((head === "data" || head === "patch") && rest.length) out[rest.join(".")] ??= issue.message;
  }
  return out;
}

/**
 * Wraps a Server Action: verifies the session, validates input with Zod, maps errors to
 * ActionResult, and revalidates the whole app layout so every page reflects the change.
 */
export function defineAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.infer<S>) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (raw) => {
    await requireSession(); // may redirect: must stay outside try/catch
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error);
      return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input", fieldErrors };
    }
    try {
      const data = await handler(parsed.data);
      revalidatePath("/", "layout");
      return { ok: true, data };
    } catch (err) {
      if (err instanceof UserError) return { ok: false, error: err.message };
      log.error("action failed", { error: errorMessage(err) });
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
