"use client";

import { ArrowDownRight, ArrowUpRight, Bell, ChevronLeft, ChevronRight, Download, Minus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { PageHeader } from "@/components/app-shell/page-header";
import { useAppData } from "@/components/app-data";
import { CategoryDot } from "@/components/categories/category-badge";
import { DataTable } from "@/components/dashboard/chart-card";
import { DateTime, useMoneyFormatter } from "@/components/prefs/display";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addJalaliMonths, jalaliMonthLength } from "@/lib/format/jalali";
import { dayKeyFromJalali, monthKey, timeAgo } from "@/lib/format/time";
import { emptyFilters, filtersToParams } from "@/lib/schemas/transaction";
import type { InsightsData } from "@/server/queries/insights";

function Card({
  title,
  subtitle,
  children,
  className,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Change({ pct, delta }: { pct: number | null; delta: number }) {
  const fmt = useMoneyFormatter();
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> same
      </span>
    );
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  // For spending, up is bad (expense color), down is good (income color); the arrow + sign carry it too.
  return (
    <span
      className={cn("amount inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-expense" : "text-income")}
    >
      <Icon className="size-3.5" />
      {pct === null ? `new · ${fmt(Math.abs(delta), { compact: true })}` : `${Math.abs(Math.round(pct * 100))}%`}
    </span>
  );
}

const csvHref = (from: string, to: string) =>
  `/api/export/transactions?${filtersToParams({ ...emptyFilters, from, to })}`;

export function InsightsView({ data }: { data: InsightsData }) {
  const fmt = useMoneyFormatter();
  const { categories } = useAppData();
  const { month } = data;
  const prev = addJalaliMonths(month.jy, month.jm, -1);
  const next = addJalaliMonths(month.jy, month.jm, 1);
  const monthFrom = dayKeyFromJalali(month.jy, month.jm, 1);
  const monthTo = dayKeyFromJalali(month.jy, month.jm, jalaliMonthLength(month.jy, month.jm));
  const yearFrom = dayKeyFromJalali(month.jy, 1, 1);
  const yearTo = dayKeyFromJalali(month.jy, 12, jalaliMonthLength(month.jy, 12));
  const yearSpent = data.year.months.reduce((s, m) => s + m.spentRial, 0);
  const yearIncome = data.year.months.reduce((s, m) => s + m.incomeRial, 0);
  const maxSpent = Math.max(...data.year.months.map((m) => m.spentRial), 1);
  const maxMerchant = data.topMerchants[0]?.amountRial ?? 1;
  const incomeTotal = data.income.reduce((s, i) => s + i.amountRial, 0);

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Trends, top merchants and reports"
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" asChild aria-label="Previous month">
                <Link href={`/insights?month=${monthKey(prev.jy, prev.jm)}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              <span className="min-w-28 text-center text-sm font-medium">{month.label}</span>
              <Button variant="ghost" size="icon-sm" asChild aria-label="Next month">
                <Link href={`/insights?month=${monthKey(next.jy, next.jm)}`}>
                  <ChevronRight />
                </Link>
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> Export CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={csvHref(monthFrom, monthTo)} download>
                    {month.label}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={csvHref(yearFrom, yearTo)} download>
                    Year {month.jy}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/api/export/transactions" download>
                    Everything
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card
          className="lg:col-span-7"
          title="Month over month"
          subtitle={`${month.label} vs ${month.prevLabel}, biggest changes first`}
        >
          {data.mom.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No spending in either month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Category</th>
                    <th className="pb-2 text-right font-medium">{month.prevLabel.split(" ")[0]}</th>
                    <th className="pb-2 text-right font-medium">{month.label.split(" ")[0]}</th>
                    <th className="pb-2 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mom.slice(0, 12).map((r) => (
                    <tr key={String(r.categoryId)} className="border-t border-border/60">
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-2">
                          <CategoryDot category={r} size="sm" />
                          <span className="truncate" dir="auto">
                            {r.name}
                          </span>
                        </span>
                      </td>
                      <td className="amount py-2 text-right text-muted-foreground">
                        {r.prevRial ? fmt(r.prevRial) : "—"}
                      </td>
                      <td className="amount py-2 text-right">{r.thisRial ? fmt(r.thisRial) : "—"}</td>
                      <td className="py-2 text-right">
                        <Change pct={r.deltaPct} delta={r.delta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          className="lg:col-span-5"
          title="Top merchants"
          subtitle={
            data.unnamedRial > 0 ? `${fmt(data.unnamedRial)} of bank SMS spending has no merchant name` : undefined
          }
        >
          {data.topMerchants.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No named merchants this month.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {data.topMerchants.map((m, i) => (
                <li key={m.name} className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="amount w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                      <Link
                        href={`/transactions?${filtersToParams({ ...emptyFilters, q: m.name, from: monthFrom, to: monthTo })}`}
                        className="truncate hover:underline"
                        dir="auto"
                      >
                        {m.name}
                      </Link>
                    </span>
                    <span className="amount shrink-0">
                      {fmt(m.amountRial)} <span className="text-xs text-muted-foreground">· {m.count}×</span>
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${(m.amountRial / maxMerchant) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          className="lg:col-span-7"
          title="Unusual transactions"
          subtitle="Far above your typical amount for the merchant or category"
        >
          {data.unusual.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Sparkles className="size-4" /> Nothing out of the ordinary this month.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {data.unusual.map((u) => {
                const c = categories.find((x) => x.id === u.categoryId);
                return (
                  <li key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
                    {c ? <CategoryDot category={c} size="sm" /> : <span className="size-5" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate" dir="auto">
                        {u.title || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <DateTime date={u.occurredAt} /> · typically {fmt(u.typicalRial)}
                      </p>
                    </div>
                    <span className="amount font-medium text-expense">{fmt(u.amountRial)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {data.largest.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs font-medium text-muted-foreground">Largest expenses</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.largest.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <DateTime date={l.occurredAt} className="shrink-0 text-xs text-muted-foreground" />
                      <span className="truncate" dir="auto">
                        {l.title || "—"}
                      </span>
                    </span>
                    <span className="amount shrink-0">{fmt(l.amountRial)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="lg:col-span-5" title="Income by source" subtitle={`${fmt(incomeTotal)} in ${month.label}`}>
          {data.income.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No income recorded this month.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.income.map((i) => (
                <li key={String(i.categoryId)} className="flex items-center gap-3 text-sm">
                  <CategoryDot category={i} size="sm" />
                  <span className="flex-1 truncate" dir="auto">
                    {i.name}
                  </span>
                  <span className="amount">{fmt(i.amountRial)}</span>
                  <span className="amount w-10 text-right text-xs text-muted-foreground">
                    {incomeTotal ? Math.round((i.amountRial / incomeTotal) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          className="lg:col-span-7"
          title={`Year ${data.year.jy}`}
          subtitle={`Spent ${fmt(yearSpent)} · Income ${fmt(yearIncome)} · Net ${fmt(yearIncome - yearSpent, { sign: "always" })}`}
        >
          <DataTable
            maxHeight="none"
            head={["Month", "Spent", "Income", "Net", "Saved"]}
            rows={data.year.months.map((m) => [
              <span key="m" className="flex items-center gap-2">
                <span
                  className="h-1.5 rounded-full bg-[color:var(--expense)]/60"
                  style={{ width: `${Math.max(2, (m.spentRial / maxSpent) * 48)}px` }}
                  aria-hidden
                />
                <span className={cn(m.key === month.key && "font-medium text-foreground")}>
                  {m.label.split(" ")[0]}
                </span>
              </span>,
              m.spentRial ? fmt(m.spentRial) : "—",
              m.incomeRial ? fmt(m.incomeRial) : "—",
              m.spentRial || m.incomeRial ? fmt(m.incomeRial - m.spentRial, { sign: "always" }) : "—",
              m.incomeRial > 0 ? `${Math.round(((m.incomeRial - m.spentRial) / m.incomeRial) * 100)}%` : "—",
            ])}
          />
        </Card>

        <Card className="lg:col-span-5" title="Summaries & alerts" subtitle="Also sent to you on Telegram">
          {data.feed.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Bell className="size-4" />
              Weekly summaries arrive on Friday mornings; alerts appear as they happen.
            </p>
          ) : (
            <ul className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
              {data.feed.map((n) => (
                <li key={n.id} className="rounded-xl bg-muted/40 p-3">
                  <p className="mb-1 flex items-center justify-between text-[0.7rem] text-muted-foreground">
                    <span className="uppercase tracking-wide">{n.type.replace(/_/g, " ")}</span>
                    <span>
                      {timeAgo(new Date(n.createdAt))}
                      {n.status === "queued" && " · waiting for quiet hours to end"}
                    </span>
                  </p>
                  <p className="font-persian text-sm leading-7 whitespace-pre-wrap" dir="auto">
                    {n.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
