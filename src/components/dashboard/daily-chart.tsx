"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMoneyFormatter } from "@/components/prefs/display";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { formatDate, parseDayKey } from "@/lib/format/time";
import type { DailyPoint } from "@/server/queries/dashboard";
import { axisTick, CHART } from "./chart-theme";
import { ChartCard, ChartTooltipBox, DataTable, TooltipRow } from "./chart-card";

function keyToDate(key: string) {
  const d = parseDayKey(key)!;
  return new Date(Date.UTC(d.year, d.month - 1, d.day, 9));
}

export function DailyChart({
  data,
  monthLabel,
  averageRial,
}: {
  data: DailyPoint[];
  monthLabel: string;
  averageRial: number;
}) {
  const fmt = useMoneyFormatter();
  const { calendar } = usePrefs();
  const points = data.map((d) => ({ ...d, value: d.isFuture ? null : d.spentRial }));
  const spentDays = data.filter((d) => !d.isFuture);

  return (
    <ChartCard
      title="Daily spending"
      subtitle={`${monthLabel} · average ${fmt(averageRial)} per day`}
      table={
        <DataTable
          head={["Day", "Spent"]}
          rows={spentDays
            .slice()
            .reverse()
            .map((d) => [formatDate(keyToDate(d.dayKey), { calendar }), d.spentRial ? fmt(d.spentRial) : "—"])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              tick={axisTick}
              interval="preserveStartEnd"
              minTickGap={8}
            />
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
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !p || p.isFuture) return null;
                return (
                  <ChartTooltipBox
                    title={`${formatDate(keyToDate(p.dayKey), { calendar })}${p.isToday ? " · today" : ""}`}
                  >
                    <TooltipRow color={CHART.expense} label="Spent" value={fmt(p.spentRial)} />
                  </ChartTooltipBox>
                );
              }}
            />
            <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {points.map((p) => (
                // Emphasis: today in full strength, earlier days slightly receded.
                <Cell key={p.dayKey} fill={CHART.expense} fillOpacity={p.isToday ? 1 : 0.72} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
