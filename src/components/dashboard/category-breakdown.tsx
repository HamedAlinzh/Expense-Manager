"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CategoryDot } from "@/components/categories/category-badge";
import { useMoneyFormatter } from "@/components/prefs/display";
import { filtersToParams, emptyFilters } from "@/lib/schemas/transaction";
import type { CategorySlice } from "@/server/queries/dashboard";
import { CHART } from "./chart-theme";
import { ChartCard, ChartTooltipBox, TooltipRow } from "./chart-card";

const MAX_SLICES = 6; // part-to-whole reads at a glance only up to ~6 segments

type Slice = CategorySlice & { key: string };

function toSlices(categories: CategorySlice[]): Slice[] {
  const head = categories.slice(0, categories.length > MAX_SLICES ? MAX_SLICES - 1 : MAX_SLICES);
  const tail = categories.slice(head.length);
  const out: Slice[] = head.map((c) => ({ ...c, key: String(c.categoryId) }));
  if (tail.length) {
    out.push({
      key: "other",
      categoryId: null,
      name: `Other (${tail.length})`,
      icon: "circle-ellipsis",
      color: "#52525b",
      amountRial: tail.reduce((s, c) => s + c.amountRial, 0),
    });
  }
  return out;
}

export function CategoryBreakdown({
  categories,
  totalRial,
  range,
}: {
  categories: CategorySlice[];
  totalRial: number;
  range: { from: string; to: string };
}) {
  const fmt = useMoneyFormatter();
  const slices = toSlices(categories);
  const max = categories[0]?.amountRial ?? 0;
  const pct = (v: number) => (totalRial > 0 ? Math.round((v / totalRial) * 100) : 0);
  const href = (categoryId: number | null) =>
    `/transactions?${filtersToParams({ ...emptyFilters, from: range.from, to: range.to, types: ["expense"], categories: [categoryId ?? 0] })}` as const;

  return (
    <ChartCard title="Spending by category" subtitle="Subcategories roll up into their parent; splits count per part">
      {categories.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No spending this month yet.</p>
      ) : (
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_1fr]">
          <div className="relative mx-auto aspect-square w-full max-w-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="amountRial"
                  nameKey="name"
                  innerRadius="70%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke={CHART.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    const s = payload?.[0]?.payload as Slice | undefined;
                    if (!active || !s) return null;
                    return (
                      <ChartTooltipBox title={s.name}>
                        <TooltipRow
                          color={s.color}
                          label={`${pct(s.amountRial)}% of spending`}
                          value={fmt(s.amountRial)}
                        />
                      </ChartTooltipBox>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-semibold tracking-tight">
                {fmt(totalRial, { compact: totalRial >= 1_000_000_000 })}
              </span>
            </div>
          </div>
          {/* The ranked list is the labeled twin of the donut: names, amounts and shares for every category. */}
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
            {categories.map((c) => (
              <li key={String(c.categoryId)}>
                <Link
                  href={href(c.categoryId)}
                  className="group flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-accent/50"
                >
                  <CategoryDot category={c} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate" dir="auto">
                        {c.name}
                      </span>
                      <span className="amount shrink-0 text-foreground">{fmt(c.amountRial)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${max ? (c.amountRial / max) * 100 : 0}%`, backgroundColor: c.color }}
                        />
                      </div>
                      <span className="amount w-8 text-right text-[0.7rem] text-muted-foreground">
                        {pct(c.amountRial)}%
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
