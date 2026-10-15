"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMoneyFormatter } from "@/components/prefs/display";
import type { TrendPoint } from "@/server/queries/dashboard";
import { axisTick, CHART } from "./chart-theme";
import { ChartCard, ChartTooltipBox, DataTable, TooltipRow } from "./chart-card";

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ backgroundColor: CHART.income }} /> Income
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ backgroundColor: CHART.expense }} /> Spent
      </span>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const fmt = useMoneyFormatter();
  return (
    <ChartCard
      title="Income vs spending"
      subtitle="Last 6 Jalali months · transfers excluded"
      action={<Legend />}
      table={
        <DataTable
          head={["Month", "Income", "Spent", "Net"]}
          rows={data
            .slice()
            .reverse()
            .map((d) => [
              d.label,
              fmt(d.incomeRial),
              fmt(d.spentRial),
              fmt(d.incomeRial - d.spentRial, { sign: "always" }),
            ])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
            <XAxis dataKey="short" tickLine={false} axisLine={{ stroke: CHART.axis }} tick={axisTick} />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              tickFormatter={(v: number) => fmt(v, { compact: true, withUnit: false })}
            />
            <Tooltip
              cursor={{ fill: CHART.cursor }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as TrendPoint | undefined;
                if (!active || !p) return null;
                const net = p.incomeRial - p.spentRial;
                return (
                  <ChartTooltipBox title={p.label}>
                    <TooltipRow color={CHART.income} label="Income" value={fmt(p.incomeRial)} />
                    <TooltipRow color={CHART.expense} label="Spent" value={fmt(p.spentRial)} />
                    <div className="my-0.5 border-t border-border" />
                    <TooltipRow label="Net" value={fmt(net, { sign: "always" })} />
                  </ChartTooltipBox>
                );
              }}
            />
            <Bar
              dataKey="incomeRial"
              name="Income"
              fill={CHART.income}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="spentRial"
              name="Spent"
              fill={CHART.expense}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
