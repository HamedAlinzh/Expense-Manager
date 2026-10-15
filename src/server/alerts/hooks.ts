import "server-only";
import { errorMessage, log } from "@/lib/logger";

/**
 * Fire-and-forget alert checks after a transaction is written (SMS, bot or web). Loaded lazily to
 * keep the services ↔ notifications import graph acyclic, and never blocks or fails the write.
 */
export function afterTransactionWrite(txId: number): void {
  void import("./transaction-alerts")
    .then((m) => m.checkTransaction(txId))
    .catch((err) => log.error("alerts: check failed", { txId, error: errorMessage(err) }));
}
