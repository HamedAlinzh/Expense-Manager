import "server-only";
import { eq, getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/server/errors";

/** Tables in a backup, in foreign-key order (parents first). Settings last: it references cards. */
const ORDER: [keyof BackupData, PgTable][] = [
  ["cards", s.cards],
  ["categories", s.categories],
  ["categoryRules", s.categoryRules],
  ["rawMessages", s.rawMessages],
  ["transactions", s.transactions],
  ["transactionSplits", s.transactionSplits],
  ["budgets", s.budgets],
  ["recurringSeries", s.recurringSeries],
  ["savedViews", s.savedViews],
  ["importMappings", s.importMappings],
  ["settings", s.settings],
];

const rows = z.array(z.record(z.string(), z.unknown())).max(1_000_000);

export const backupSchema = z.object({
  format: z.literal("expense-manager-backup"),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  data: z.object({
    settings: rows,
    cards: rows,
    categories: rows,
    categoryRules: rows,
    transactions: rows,
    transactionSplits: rows,
    rawMessages: rows,
    budgets: rows,
    recurringSeries: rows,
    savedViews: rows,
    importMappings: rows.default([]),
  }),
});
type BackupData = z.infer<typeof backupSchema>["data"];

/** Backup rows use the app's camelCase property names; the database wants column names. */
function toColumns(table: PgTable, list: Record<string, unknown>[]) {
  const cols = Object.entries(getTableColumns(table));
  return list.map((row) =>
    Object.fromEntries(cols.filter(([prop]) => prop in row).map(([prop, col]) => [col.name, row[prop]])),
  );
}

/**
 * Replaces ALL data with the backup's contents in one transaction (all or nothing). IDs are kept so
 * links between rows survive; identity sequences are moved past the restored IDs. The current
 * session stays valid. Notification history is cleared (it refers to the replaced data).
 */
export async function restoreBackup(input: unknown): Promise<Record<string, number>> {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success)
    throw new UserError("This file isn't an Expense Manager backup (or it's from an incompatible version).");
  const data = parsed.data.data;

  return db().transaction(async (tx) => {
    const [current] = await tx.select({ v: s.settings.sessionVersion }).from(s.settings).where(eq(s.settings.id, 1));
    const names = [...ORDER.map(([, t]) => getTableName(t)), getTableName(s.notificationsLog)];
    await tx.execute(sql.raw(`truncate ${names.map((n) => `"${n}"`).join(", ")} restart identity cascade`));

    const counts: Record<string, number> = {};
    for (const [key, table] of ORDER) {
      const list = data[key];
      counts[key] = list.length;
      if (list.length === 0) continue;
      const name = getTableName(table);
      // Chunked to keep each statement's JSON parameter reasonable.
      for (let i = 0; i < list.length; i += 2000) {
        const json = JSON.stringify(toColumns(table, list.slice(i, i + 2000)));
        await tx.execute(
          sql`insert into ${sql.identifier(name)} overriding system value select * from json_populate_recordset(null::${sql.identifier(name)}, ${json}::json)`,
        );
      }
      if ("id" in getTableColumns(table) && name !== "settings") {
        await tx.execute(
          sql`select setval(pg_get_serial_sequence(${`"${name}"`}, 'id'), greatest(coalesce(max(id), 0), 1), max(id) is not null) from ${sql.identifier(name)}`,
        );
      }
    }
    if (current) await tx.update(s.settings).set({ sessionVersion: current.v }).where(eq(s.settings.id, 1));
    return counts;
  });
}
