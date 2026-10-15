import type { Metadata } from "next";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { parseFilters } from "@/lib/schemas/transaction";
import { listSavedViews, listTags, listTransactions, PAGE_SIZE } from "@/server/queries/transactions";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params.set(k, v);
  const filters = parseFilters(params);

  const [{ rows, totals, page, pageCount }, savedViews, tags] = await Promise.all([
    listTransactions(filters),
    listSavedViews(),
    listTags(),
  ]);

  return (
    <TransactionsView
      filters={{ ...filters, page }}
      rows={rows}
      totals={totals}
      page={page}
      pageCount={pageCount}
      pageSize={PAGE_SIZE}
      savedViews={savedViews}
      tags={tags}
    />
  );
}
