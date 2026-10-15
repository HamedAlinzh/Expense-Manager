"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Inbox,
  Minus,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { useAppData } from "@/components/app-data";
import { CategoryDot } from "@/components/categories/category-badge";
import { DateTime, Money, useMoneyFormatter } from "@/components/prefs/display";
import { CardDot } from "@/components/transactions/card-picker";
import { QuickAddButton } from "@/components/transactions/quick-add";
import { StatusPill } from "@/components/transactions/tx-meta";
import { Button } from "@/components/ui/button";
import { addJalaliMonths, jalaliMonthLength } from "@/lib/format/jalali";
import { dayKeyFromJalali, monthKey } from "@/lib/format/time";
import { emptyFilters, filtersToParams } from "@/lib/schemas/transaction";
import type { BudgetProgress, DashboardData } from "@/server/queries/dashboard";
import { CategoryBreakdown } from "./category-breakdown";
import { ChartCard } from "./chart-card";
import { DailyChart } from "./daily-chart";
import { TrendChart } from "./trend-chart";

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Signed delta chip. `upIsGood` decides the color; an arrow icon + words carry the meaning too. */
function Delta({ value, upIsGood, children }: { value: number | null; upIsGood: boolean; children: ReactNode }) {
  if (value === null) return <span className="text-xs text-muted-foreground">{children}</span>;
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : up === upIsGood;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium",
          good === true && "text-income",
          good === false && "text-expense",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {Math.abs(value)}%
      </span>
      {children}
    </span>
  );
}

function StatTile({
  label,
  value,
  delta,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      {delta ?? <span className="h-4" />}
    </div>
  );
}

function MonthNav({ data }: { data: DashboardData }) {
  const prev = addJalaliMonths(data.month.jy, data.month.jm, -1);
  const next = addJalaliMonths(data.month.jy, data.month.jm, 1);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" asChild aria-label="Previous month">
        <Link href={`/?month=${monthKey(prev.jy, prev.jm)}`}>
          <ChevronLeft />
        </Link>
      </Button>
      <span className="min-w-28 text-center text-sm font-medium">{data.month.label}</span>
      {data.canGoForward ? (
        <Button variant="ghost" size="icon-sm" asChild aria-label="Next month">
          <Link href={data.month.isCurrent ? "/" : `/?month=${monthKey(next.jy, next.jm)}`}>
            <ChevronRight />
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" disabled aria-label="Next month">
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}

function Hero({ data }: { data: DashboardData }) {
  const fmt = useMoneyFormatter();
  const { totals, prev, forecast, month } = data;
  const change = pctChange(totals.spentRial, month.isCurrent ? prev.toDate.spentRial : prev.totals.spentRial);
  const lastMonthTotal = prev.totals.spentRial;
  const scaleMax = Math.max(forecast.projectedRial, lastMonthTotal, 1);

  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <p className="text-sm text-muted-foreground">Spent in {month.label}</p>
      {/* Hero figure: proportional digits at display size (no tabular-nums). */}
      <p className="mt-1 text-4xl font-semibold tracking-tight break-all sm:text-5xl" dir="ltr">
        {fmt(totals.spentRial)}
      </p>
      <div className="mt-2">
        <Delta value={change} upIsGood={false}>
          {month.isCurrent ? `vs ${prev.label} by day ${prev.cutDay}` : `vs ${prev.label}`}
        </Delta>
      </div>

      {month.isCurrent ? (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">At this pace</span>
            <span className="font-medium">
              {fmt(forecast.projectedRial)} <span className="text-muted-foreground">by month end</span>
            </span>
          </div>
          {/* Meter: spent so far (solid) and projected remainder (lighter step of the same hue). */}
          <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
              style={{ width: `${(forecast.projectedRial / scaleMax) * 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${(totals.spentRial / scaleMax) * 100}%` }}
            />
            {lastMonthTotal > 0 && (
              <div
                className="absolute inset-y-[-2px] w-0.5 bg-foreground/70"
                style={{ left: `calc(${(lastMonthTotal / scaleMax) * 100}% - 1px)` }}
                title={`${prev.label} total`}
              />
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Day {month.dayOfMonth} of {month.daysInMonth} · {month.daysLeft} {month.daysLeft === 1 ? "day" : "days"}{" "}
              left
            </span>
            {lastMonthTotal > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-0.5 bg-foreground/70" /> {prev.label}: {fmt(lastMonthTotal)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          {totals.count} transactions · {prev.label}: {fmt(lastMonthTotal)}
        </p>
      )}
    </section>
  );
}

function budgetState(b: BudgetProgress): "ok" | "warning" | "over" {
  const pct = (b.spentRial / b.limitRial) * 100;
  const warnAt = Math.min(...b.thresholds.filter((t) => t < 100), 80);
  if (pct >= 100) return "over";
  if (pct >= warnAt) return "warning";
  return "ok";
}

function Budgets({
  budgets,
  daysLeft,
  isCurrent,
}: {
  budgets: BudgetProgress[];
  daysLeft: number;
  isCurrent: boolean;
}) {
  const fmt = useMoneyFormatter();
  return (
    <ChartCard
      title="Budgets"
      subtitle={isCurrent ? `${daysLeft} days left this month` : "Month total"}
      action={
        <Link href="/budgets" className="text-xs text-muted-foreground hover:text-foreground">
          Manage
        </Link>
      }
    >
      {budgets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Target className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No budgets yet.</p>
          <Link href="/budgets" className="text-sm text-primary hover:underline">
            Set monthly limits
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {budgets.map((b) => {
            const state = budgetState(b);
            const pct = Math.round((b.spentRial / b.limitRial) * 100);
            const fill = state === "over" ? "var(--destructive)" : state === "warning" ? "#fab219" : "var(--primary)";
            return (
              <li key={b.budgetId}>
                <div className="mb-1.5 flex items-center gap-2 text-sm">
                  <CategoryDot category={b} size="sm" />
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {b.name}
                  </span>
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
                </div>
                {/* Meter: the track is a lighter step of the fill's own hue. */}
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ backgroundColor: `color-mix(in oklch, ${fill} 18%, transparent)` }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: fill }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="amount">{fmt(b.spentRial)}</span> of{" "}
                  <span className="amount">{fmt(b.limitRial)}</span>
                  {b.spentRial <= b.limitRial ? (
                    <> · {fmt(b.limitRial - b.spentRial)} left</>
                  ) : (
                    <> · {fmt(b.spentRial - b.limitRial)} over</>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

function CardSpending({ cards, range }: { cards: DashboardData["cards"]; range: { from: string; to: string } }) {
  const fmt = useMoneyFormatter();
  const max = Math.max(...cards.map((c) => c.spentRial), 1);
  return (
    <ChartCard title="Spending per card">
      <ul className="flex flex-col gap-3.5">
        {cards.map((c) => (
          <li key={c.id}>
            <Link
              href={`/transactions?${filtersToParams({ ...emptyFilters, from: range.from, to: range.to, cards: [c.id], types: ["expense"] })}`}
              className="block rounded-lg hover:opacity-90"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <CardDot color={c.color} /> {c.name}
                </span>
                <span className="amount">{fmt(c.spentRial)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(c.spentRial / max) * 100}%`, backgroundColor: c.color }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function Recent({ items }: { items: DashboardData["recent"] }) {
  const { cards, categories } = useAppData();
  return (
    <ChartCard
      title="Recent transactions"
      action={
        <Link href="/transactions" className="text-xs text-muted-foreground hover:text-foreground">
          View all
        </Link>
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          <QuickAddButton>Add transaction</QuickAddButton>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((t) => {
            const card = cards.find((c) => c.id === t.cardId);
            const category = categories.find((c) => c.id === t.categoryId);
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
                {t.type === "transfer" ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-transfer">
                    <ArrowLeftRight className="size-3.5" />
                  </span>
                ) : category ? (
                  <CategoryDot category={category} />
                ) : (
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                    ?
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" dir="auto">
                    {t.merchant || t.description || "Untitled"}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {card && <CardDot color={card.color} className="size-2 ring-0" />}
                    {card?.name ?? "No card"} · <DateTime date={t.occurredAt} time />
                  </p>
                </div>
                <StatusPill status={t.status} />
                <Money rial={t.amountRial} kind={t.type} direction={t.direction} className="text-sm font-medium" />
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  const fmt = useMoneyFormatter();
  const { totals, prev, month } = data;
  const net = totals.incomeRial - totals.spentRial;
  const savingsRate = totals.incomeRial > 0 ? Math.round((net / totals.incomeRial) * 100) : null;
  const incomeChange = pctChange(totals.incomeRial, month.isCurrent ? prev.toDate.incomeRial : prev.totals.incomeRial);
  const range = {
    from: dayKeyFromJalali(month.jy, month.jm, 1),
    to: dayKeyFromJalali(month.jy, month.jm, jalaliMonthLength(month.jy, month.jm)),
  };

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {month.isCurrent ? "This month at a glance" : "Month in review"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav data={data} />
          <QuickAddButton className="hidden sm:inline-flex" />
        </div>
      </header>

      {data.inboxCount > 0 && (
        <Link
          href="/inbox"
          className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm transition-colors hover:bg-amber-400/10"
        >
          <Inbox className="size-4 text-amber-300" />
          <span className="flex-1">
            <strong className="font-medium">{data.inboxCount}</strong>{" "}
            {data.inboxCount === 1 ? "item needs" : "items need"} your review
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Hero data={data} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-7">
          <StatTile
            label="Income"
            value={fmt(totals.incomeRial)}
            delta={<Delta value={incomeChange} upIsGood>{`vs ${prev.label}`}</Delta>}
          />
          <StatTile
            label="Net cash flow"
            value={<span className={net >= 0 ? "text-income" : "text-expense"}>{fmt(net, { sign: "always" })}</span>}
            delta={<span className="text-xs text-muted-foreground">Income minus spending</span>}
          />
          <StatTile
            label="Savings rate"
            value={savingsRate === null ? "—" : `${savingsRate}%`}
            delta={
              <span className="text-xs text-muted-foreground">
                {savingsRate === null ? "No income recorded yet" : "Share of income kept"}
              </span>
            }
          />
          <StatTile
            label={month.isCurrent ? "Daily average" : "Transactions"}
            value={month.isCurrent ? fmt(data.forecast.dailyAverageRial) : totals.count.toLocaleString("en-US")}
            delta={
              <span className="text-xs text-muted-foreground">
                {month.isCurrent ? `${totals.count} transactions so far` : `in ${month.label}`}
              </span>
            }
          />
        </div>

        <div className="lg:col-span-8">
          <DailyChart data={data.daily} monthLabel={month.label} averageRial={data.forecast.dailyAverageRial} />
        </div>
        <div className="lg:col-span-4">
          <Budgets budgets={data.budgets} daysLeft={month.daysLeft} isCurrent={month.isCurrent} />
        </div>

        <div className="lg:col-span-7">
          <CategoryBreakdown categories={data.categories} totalRial={totals.spentRial} range={range} />
        </div>
        <div className="lg:col-span-5">
          <TrendChart data={data.trend} />
        </div>

        <div className="lg:col-span-4">
          <CardSpending cards={data.cards} range={range} />
        </div>
        <div className="lg:col-span-8">
          <Recent items={data.recent} />
        </div>
      </div>
    </>
  );
}
