import { env } from "@/lib/env";
import { ingestBodySchema, parseReceivedAt, readPayload, tokenMatches } from "@/lib/ingest/request";
import { log } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ingestMessage } from "@/server/ingest/pipeline";

export const dynamic = "force-dynamic";

const MAX_BYTES = 16 * 1024;

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

/**
 * Bank SMS / app-notification ingestion (MacroDroid → app).
 * Auth: `X-Ingest-Token` header. Body: JSON or form-encoded {sender, body, received_at?, source?}.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const limited = rateLimit(`ingest:ip:${ip}`, 60, 60_000);
  if (!limited.ok) return json({ error: "rate_limited" }, 429, { "Retry-After": String(limited.retryAfterSeconds) });

  const expected = env().INGEST_TOKEN;
  if (!expected) return json({ error: "ingest_not_configured" }, 503);
  if (!tokenMatches(req.headers.get("x-ingest-token"), expected)) {
    const failures = rateLimit(`ingest:authfail:${ip}`, 10, 15 * 60_000);
    log.warn("ingest: rejected token", { ip });
    return json({ error: "unauthorized" }, failures.ok ? 401 : 429);
  }

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return json({ error: "payload_too_large" }, 413);
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: "payload_too_large" }, 413);

  const parsed = ingestBodySchema.safeParse(readPayload(req.headers.get("content-type") ?? "", text));
  if (!parsed.success)
    return json({ error: "invalid_body", fields: parsed.error.issues.map((i) => i.path.join(".")) }, 400);

  const { sender, body, received_at, source } = parsed.data;
  const outcome = await ingestMessage({ source, sender, body, receivedAt: parseReceivedAt(received_at) });
  return json(
    {
      status: outcome.status,
      raw_message_id: outcome.rawMessageId,
      ...("transactionId" in outcome ? { transaction_id: outcome.transactionId } : {}),
      ...(outcome.status === "created"
        ? { review: outcome.txStatus === "pending_review", transfer: outcome.transfer }
        : {}),
    },
    outcome.status === "failed" ? 500 : 200,
  );
}
