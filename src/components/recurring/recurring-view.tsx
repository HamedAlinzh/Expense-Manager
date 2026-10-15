"use client";

import { Check, LoaderCircle, Repeat, RotateCcw, ScanSearch, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { rescanRecurring, setRecurringStatus } from "@/app/(app)/recurring/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { useAppData } from "@/components/app-data";
import { CategoryDot } from "@/components/categories/category-badge";
import { EmptyState } from "@/components/common/empty-state";
import { DateTime, useMoneyFormatter } from "@/components/prefs/display";
import { CardDot } from "@/components/transactions/card-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { RecurringSeries as SeriesRow } from "@/db/schema";

type RecurringSeries = SeriesRow & { overdue: boolean };
import { timeAgo } from "@/lib/format/time";
import { priceChange, yearlyCost } from "@/lib/insights/recurring";

const INTERVAL_LABEL = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;

export function RecurringView({ series }: { series: RecurringSeries[] }) {
  const fmt = useMoneyFormatter();
  const [scanning, startScan] = useTransition();
  const live = series.filter((s) => s.status !== "dismissed" && s.active);
  const confirmed = live.filter((s) => s.status === "confirmed");
  const detected = live.filter((s) => s.status === "detected");
  const inactive = series.filter((s) => s.status !== "dismissed" && !s.active);
  const dismissed = series.filter((s) => s.status === "dismissed");
  const yearly = live.reduce((sum, s) => sum + yearlyCost(s.lastAmountRial, s.interval), 0);

  const rescan = () =>
    startScan(async () => {
      const res = await rescanRecurring({});
      if (res.ok)
        toast.success(`Scan complete · ${res.data.series} recurring payment${res.data.series === 1 ? "" : "s"} found`);
      else toast.error(res.error);
    });

  return (
    <>
      <PageHeader
        title="Recurring"
        subtitle="Subscriptions and repeating payments, detected from your history"
        actions={
          <Button variant="outline" onClick={rescan} disabled={scanning}>
            {scanning ? <LoaderCircle className="animate-spin" /> : <ScanSearch />} Scan now
          </Button>
        }
      />

      {series.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring payments found yet"
          body="Charges from the same merchant at similar amounts and regular intervals (3+ times) show up here. Scanning runs every morning."
          action={<Button onClick={rescan}>Scan now</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Per month" value={fmt(Math.round(yearly / 12 / 10) * 10)} />
            <Tile label="Per year" value={fmt(yearly)} />
            <Tile label="Active" value={`${live.length}`} className="col-span-2 sm:col-span-1" />
          </div>
          {confirmed.length > 0 && (
            <Group title="Confirmed" hint="You'll be told when one costs more or doesn't arrive." items={confirmed} />
          )}
          {detected.length > 0 && (
            <Group title="Detected" hint="Confirm the ones that are real; dismiss the rest." items={detected} />
          )}
          {inactive.length > 0 && <Group title="Stopped" hint="Not seen for a while." items={inactive} muted />}
          {dismissed.length > 0 && (
            <Collapsible className="mt-8">
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
                Dismissed ({dismissed.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Group items={dismissed} muted />
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card px-4 py-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Group({
  title,
  hint,
  items,
  muted,
}: {
  title?: string;
  hint?: string;
  items: RecurringSeries[];
  muted?: boolean;
}) {
  return (
    <section className="mt-8">
      {title && (
        <div className="mb-3">
          <h2 className="text-sm font-medium">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
      <ul
        className={cn(
          "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card",
          muted && "opacity-70",
        )}
      >
        {items.map((s) => (
          <Row key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}

function Row({ s }: { s: RecurringSeries }) {
  const fmt = useMoneyFormatter();
  const { cards, categories } = useAppData();
  const [pending, startTransition] = useTransition();
  const card = cards.find((c) => c.id === s.cardId);
  const category = categories.find((c) => c.id === s.categoryId);
  const change = priceChange(s);
  const { overdue } = s;
  const set = (status: "detected" | "confirmed" | "dismissed", msg: string) =>
    startTransition(async () => {
      const res = await setRecurringStatus({ id: s.id, status });
      if (res.ok) toast.success(msg);
      else toast.error(res.error);
    });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
      {category ? (
        <CategoryDot category={category} size="lg" />
      ) : (
        <span className="grid size-10 place-items-center rounded-xl bg-muted">
          <Repeat className="size-4 text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/transactions?q=${encodeURIComponent(s.merchant)}`}
            className="truncate font-medium hover:underline"
            dir="auto"
          >
            {s.merchant}
          </Link>
          <Badge variant="outline">{INTERVAL_LABEL[s.interval]}</Badge>
          {change !== null && (
            <Badge className={cn("gap-1", change > 0 ? "bg-expense/15 text-expense" : "bg-income/15 text-income")}>
              {change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {change > 0 ? "+" : "−"}
              {Math.abs(Math.round(change * 100))}%
            </Badge>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {card && (
            <span className="inline-flex items-center gap-1.5">
              <CardDot color={card.color} className="size-2 ring-0" /> {card.name}
            </span>
          )}
          <span>
            {s.occurrences} charges · last {timeAgo(s.lastSeenAt)}
          </span>
          {s.active && s.status !== "dismissed" && (
            <span className={cn(overdue && "text-amber-300")}>
              · next <DateTime date={s.nextExpectedAt} /> {overdue && "(overdue)"}
            </span>
          )}
        </p>
      </div>
      <div className="text-right">
        <p className="amount font-semibold">{fmt(s.lastAmountRial)}</p>
        <p className="amount text-xs text-muted-foreground">{fmt(yearlyCost(s.lastAmountRial, s.interval))}/yr</p>
      </div>
      <div className="flex gap-1">
        {s.status === "detected" && (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Dismiss"
              disabled={pending}
              onClick={() => set("dismissed", "Dismissed")}
            >
              <X />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => set("confirmed", "Confirmed — you'll be alerted about changes")}
            >
              <Check /> Confirm
            </Button>
          </>
        )}
        {s.status === "confirmed" && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Dismiss"
            disabled={pending}
            onClick={() => set("dismissed", "Dismissed")}
          >
            <X />
          </Button>
        )}
        {s.status === "dismissed" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("detected", "Restored")}>
            <RotateCcw /> Restore
          </Button>
        )}
      </div>
    </li>
  );
}
