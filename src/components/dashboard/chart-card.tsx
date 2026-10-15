"use client";

import { ChartColumn, Table2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "cn";

/** Card wrapper for a chart with an optional Chart ⇄ Table toggle (every chart has a table twin). */
export function ChartCard({
  title,
  subtitle,
  action,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <div className="flex rounded-lg bg-muted/60 p-0.5" role="group" aria-label="View">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-label={v === "chart" ? "Chart view" : "Table view"}
                  onClick={() => setView(v)}
                  className={cn(
                    "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    view === v && "bg-background text-foreground shadow-sm",
                  )}
                >
                  {v === "chart" ? <ChartColumn className="size-3.5" /> : <Table2 className="size-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="min-w-0 flex-1">{view === "table" && table ? table : children}</div>
    </section>
  );
}

export function ChartTooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-36 rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur">
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export function TooltipRow({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <span className="amount text-foreground">{value}</span>
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={cn("amount px-3 py-1.5", j === 0 ? "text-left text-muted-foreground" : "text-right")}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
