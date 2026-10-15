"use client";

import { ArrowLeftRight, ChevronLeft, ChevronRight, ListChecks, SearchX } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { cn } from "cn";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/prefs/display";
import { Button } from "@/components/ui/button";
import { activeFilterCount, emptyFilters, filtersToParams, type TxFilters } from "@/lib/schemas/transaction";
import type { TxListRow, TxTotals } from "@/server/queries/transactions";
import { BulkBar } from "./bulk-bar";
import { FilterBar } from "./filter-bar";
import { QuickAddButton } from "./quick-add";
import { TxDrawer } from "./tx-drawer";
import { TxList } from "./tx-list";

type Props = {
  filters: TxFilters;
  rows: TxListRow[];
  totals: TxTotals;
  page: number;
  pageCount: number;
  pageSize: number;
  savedViews: { id: number; name: string; filters: unknown }[];
  tags: string[];
};

export function TransactionsView({ filters, rows, totals, page, pageCount, pageSize, savedViews, tags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [rawSelected, setSelected] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const lastToggled = useRef<number | null>(null);

  const navigate = useCallback(
    (next: TxFilters) => {
      const qs = filtersToParams(next).toString();
      startNavigation(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [router, pathname],
  );

  // Only rows on the current page can be selected; filtering or paging drops the rest.
  const selected = useMemo(
    () => new Set(rows.map((r) => r.id).filter((id) => rawSelected.has(id))),
    [rows, rawSelected],
  );

  function toggle(id: number, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const on = !prev.has(id);
      if (shiftKey && lastToggled.current !== null) {
        const ids = rows.map((r) => r.id);
        const [a = -1, b = -1] = [ids.indexOf(lastToggled.current), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const rid of ids.slice(a, b + 1)) setMembership(next, rid, on);
      } else {
        setMembership(next, id, on);
      }
      lastToggled.current = id;
      return next;
    });
  }

  function toggleAll(ids: number[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) setMembership(next, id, on);
      return next;
    });
  }

  const clearSelection = () => {
    setSelected(new Set());
    setSelectionMode(false);
  };
  const net = totals.incomeRial - totals.expenseRial;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totals.count);
  const filtered = activeFilterCount(filters) > 0;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every expense, income and transfer across your cards"
        actions={
          <>
            <Button
              variant="outline"
              className="md:hidden"
              onClick={() => (selectionMode ? clearSelection() : setSelectionMode(true))}
            >
              <ListChecks /> {selectionMode ? "Done" : "Select"}
            </Button>
            <QuickAddButton />
          </>
        }
      />

      <FilterBar filters={filters} onChange={navigate} savedViews={savedViews} tagSuggestions={tags} />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Transactions" value={<span className="amount">{totals.count.toLocaleString("en-US")}</span>} />
        <Stat label="Spent" value={<Money rial={totals.expenseRial} className="text-expense" />} />
        <Stat label="Income" value={<Money rial={totals.incomeRial} className="text-income" />} />
        <Stat
          label="Net"
          value={<Money rial={net} sign="always" className={net >= 0 ? "text-income" : "text-expense"} />}
          hint="Transfers excluded"
        />
      </div>

      <div
        className={cn("mt-5 transition-opacity duration-200", navigating && "pointer-events-none opacity-60")}
        aria-busy={navigating}
      >
        {rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No transactions match these filters"
              body="Try widening the date range or removing a filter."
              action={
                <Button variant="outline" onClick={() => navigate(emptyFilters)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transactions yet"
              body="Add one manually now. Bank SMS and the Telegram bot will fill this in automatically once they're connected."
              action={<QuickAddButton>Add transaction</QuickAddButton>}
            />
          )
        ) : (
          <TxList
            rows={rows}
            selected={selected}
            selectionMode={selectionMode || selected.size > 0}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={setOpenId}
          />
        )}
      </div>

      {pageCount > 1 && (
        <nav
          className="mt-5 flex items-center justify-between gap-3 text-sm text-muted-foreground"
          aria-label="Pagination"
        >
          <span className="amount">
            {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {totals.count.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || navigating}
              onClick={() => navigate({ ...filters, page: page - 1 })}
            >
              <ChevronLeft /> Newer
            </Button>
            <span className="amount">
              {page} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || navigating}
              onClick={() => navigate({ ...filters, page: page + 1 })}
            >
              Older <ChevronRight />
            </Button>
          </div>
        </nav>
      )}

      {selected.size > 0 && <BulkBar ids={[...selected]} onDone={clearSelection} onClear={clearSelection} />}
      <TxDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function setMembership(set: Set<number>, id: number, on: boolean) {
  if (on) set.add(id);
  else set.delete(id);
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
