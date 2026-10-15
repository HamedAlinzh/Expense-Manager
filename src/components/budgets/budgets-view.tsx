"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  EllipsisVertical,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { removeBudget } from "@/app/(app)/budgets/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { useAppData } from "@/components/app-data";
import { CategoryDot } from "@/components/categories/category-badge";
import { EmptyState } from "@/components/common/empty-state";
import { useMoneyFormatter } from "@/components/prefs/display";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addJalaliMonths } from "@/lib/format/jalali";
import { monthKey } from "@/lib/format/time";
import type { BudgetsPageData } from "@/server/queries/budgets";
import { BudgetDialog, type BudgetDraft } from "./budget-dialog";

type Budget = BudgetsPageData["budgets"][number];

function stateOf(spent: number, limit: number, thresholds: number[]): "ok" | "warning" | "over" {
  const pct = (spent / limit) * 100;
  if (pct >= 100) return "over";
  return pct >= Math.min(80, ...thresholds.filter((t) => t < 100)) ? "warning" : "ok";
}

const FILL = { ok: "var(--primary)", warning: "#fab219", over: "var(--destructive)" } as const;

export function BudgetsView({ data }: { data: BudgetsPageData }) {
  const fmt = useMoneyFormatter();
  const { categories } = useAppData();
  const [dialog, setDialog] = useState<{ open: boolean; draft: BudgetDraft; key: number }>({
    open: false,
    draft: { categoryId: null, amountRial: null, thresholds: [80, 100] },
    key: 0,
  });
  const [, startTransition] = useTransition();
  const { month, budgets } = data;
  const prev = addJalaliMonths(month.jy, month.jm, -1);
  const next = addJalaliMonths(month.jy, month.jm, 1);

  const totalLimit = budgets.reduce((s, b) => s + b.limitRial, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spentRial, 0);
  const pace = month.dayOfMonth / month.daysInMonth;

  const open = (draft: BudgetDraft) => setDialog((d) => ({ open: true, draft, key: d.key + 1 }));

  return (
    <>
      <PageHeader
        title="Budgets"
        subtitle="Monthly limits per category, following the Jalali calendar"
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" asChild aria-label="Previous month">
                <Link href={`/budgets?month=${monthKey(prev.jy, prev.jm)}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              <span className="min-w-28 text-center text-sm font-medium">{month.label}</span>
              {data.canGoForward ? (
                <Button variant="ghost" size="icon-sm" asChild aria-label="Next month">
                  <Link href={`/budgets?month=${monthKey(next.jy, next.jm)}`}>
                    <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <Button variant="ghost" size="icon-sm" disabled aria-label="Next month">
                  <ChevronRight />
                </Button>
              )}
            </div>
            <Button onClick={() => open({ categoryId: null, amountRial: null, thresholds: [80, 100] })}>
              <Plus /> Add budget
            </Button>
          </>
        }
      />

      {budgets.length === 0 ? (
        <EmptyState
          icon={Target}
          title={`No budgets for ${month.label}`}
          body="Set a monthly limit for the categories you want to keep an eye on. You'll get a Telegram message at 80% and 100%."
          action={
            <Button onClick={() => open({ categoryId: null, amountRial: null, thresholds: [80, 100] })}>
              Add your first budget
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Budgeted" value={fmt(totalLimit)} />
            <Tile label="Spent" value={fmt(totalSpent)} />
            <Tile
              label={totalSpent > totalLimit ? "Over" : "Remaining"}
              value={
                <span className={totalSpent > totalLimit ? "text-expense" : undefined}>
                  {fmt(Math.abs(totalLimit - totalSpent))}
                </span>
              }
            />
            <Tile
              label={month.isCurrent ? "Days left" : "Month"}
              value={month.isCurrent ? String(month.daysLeft) : "Closed"}
            />
          </div>

          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {budgets.map((b) => (
              <BudgetCard
                key={b.budgetId}
                b={b}
                pace={month.isCurrent ? pace : null}
                onEdit={() => open({ categoryId: b.categoryId, amountRial: b.limitRial, thresholds: b.thresholds })}
                onRemove={() =>
                  startTransition(async () => {
                    const res = await removeBudget({ categoryId: b.categoryId, month: month.key });
                    if (res.ok) toast.success(`${b.name} budget removed from ${month.label} on`);
                    else toast.error(res.error);
                  })
                }
              />
            ))}
          </ul>
        </>
      )}

      <History data={data} categoryName={(id) => categories.find((c) => c.id === id)} />

      <BudgetDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        initial={dialog.draft}
        month={month.key}
        monthLabel={month.label}
        budgetedIds={budgets.map((b) => b.categoryId)}
      />
    </>
  );
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function BudgetCard({
  b,
  pace,
  onEdit,
  onRemove,
}: {
  b: Budget;
  pace: number | null;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const fmt = useMoneyFormatter();
  const state = stateOf(b.spentRial, b.limitRial, b.thresholds);
  const pct = Math.round((b.spentRial / b.limitRial) * 100);
  const fill = FILL[state];
  const aheadOfPace = pace !== null && b.spentRial / b.limitRial > pace + 0.1 && state === "ok";
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        <CategoryDot category={b} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" dir="auto">
            {b.name}
          </p>
          <p className="text-xs text-muted-foreground">alerts at {b.thresholds.map((t) => `${t}%`).join(" · ")}</p>
        </div>
        {state === "over" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <CircleAlert className="size-3.5" /> Over
          </span>
        )}
        {state === "warning" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
            <AlertTriangle className="size-3.5" /> {pct}%
          </span>
        )}
        {state === "ok" && <span className="amount text-xs text-muted-foreground">{pct}%</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${b.name} actions`}>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Meter (track = lighter step of the fill) with a marker for where spending "should" be today. */}
      <div className="relative">
        <div
          className="h-2 overflow-hidden rounded-full"
          style={{ backgroundColor: `color-mix(in oklch, ${fill} 18%, transparent)` }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: fill }}
          />
        </div>
        {pace !== null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
                style={{ left: `calc(${Math.min(pace, 1) * 100}% - 1px)` }}
                aria-label="Today's pace"
              />
            </TooltipTrigger>
            <TooltipContent>Even pace for today: {fmt(Math.round((b.limitRial * pace) / 10) * 10)}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="amount text-foreground">{fmt(b.spentRial)}</span> of{" "}
          <span className="amount">{fmt(b.limitRial)}</span>
        </span>
        <span className={cn(state === "over" && "text-destructive", aheadOfPace && "text-amber-300")}>
          {b.spentRial <= b.limitRial
            ? `${fmt(b.limitRial - b.spentRial)} left`
            : `${fmt(b.spentRial - b.limitRial)} over`}
          {aheadOfPace && " · ahead of pace"}
        </span>
      </p>
    </li>
  );
}

function History({
  data,
  categoryName,
}: {
  data: BudgetsPageData;
  categoryName: (id: number) => { name: string; icon: string; color: string } | undefined;
}) {
  const fmt = useMoneyFormatter();
  const ids = [...new Set(data.history.flatMap((h) => h.items.map((i) => i.categoryId)))];
  if (ids.length === 0) return null;
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">History</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">Share of each budget used, last 6 months</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-2 text-left font-medium">Category</th>
              {data.history.map((h) => (
                <th key={h.key} className="pb-2 text-right font-medium">
                  {h.label.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const c = categoryName(id);
              return (
                <tr key={id} className="border-t border-border/60">
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      {c && <CategoryDot category={c} size="sm" />}
                      <span className="truncate" dir="auto">
                        {c?.name ?? "—"}
                      </span>
                    </span>
                  </td>
                  {data.history.map((h) => {
                    const item = h.items.find((i) => i.categoryId === id);
                    if (!item)
                      return (
                        <td key={h.key} className="py-2 text-right text-muted-foreground/50">
                          —
                        </td>
                      );
                    const pct = Math.round((item.spentRial / item.limitRial) * 100);
                    const state = pct >= 100 ? "over" : pct >= 80 ? "warning" : "ok";
                    return (
                      <td key={h.key} className="py-2 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "amount inline-block min-w-12 rounded-md px-1.5 py-0.5 text-xs",
                                state === "over" && "bg-destructive/15 text-destructive",
                                state === "warning" && "bg-amber-400/10 text-amber-300",
                                state === "ok" && "text-muted-foreground",
                              )}
                            >
                              {pct}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {fmt(item.spentRial)} of {fmt(item.limitRial)}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
