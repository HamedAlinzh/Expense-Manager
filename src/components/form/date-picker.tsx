"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addJalaliMonths,
  GREGORIAN_MONTHS_EN,
  JALALI_MONTHS_EN,
  jalaliMonthLength,
  toJalali,
} from "@/lib/format/jalali";
import { type CalendarKind, type DayKey, dayKeyFromJalali, dayKeyOf, formatDate, parseDayKey } from "@/lib/format/time";

type View = { year: number; month: number };

function weekdayOfKey(key: DayKey): number {
  const d = parseDayKey(key)!;
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay(); // 0 = Sunday
}

function gregorianKey(y: number, m: number, d: number): DayKey {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function viewOf(key: DayKey, calendar: CalendarKind): View {
  const d = parseDayKey(key)!;
  if (calendar === "jalali") {
    const j = toJalali(d.year, d.month, d.day);
    return { year: j.jy, month: j.jm };
  }
  return { year: d.year, month: d.month };
}

function shiftView(v: View, n: number, calendar: CalendarKind): View {
  if (calendar === "jalali") {
    const r = addJalaliMonths(v.year, v.month, n);
    return { year: r.jy, month: r.jm };
  }
  const idx = v.year * 12 + (v.month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function monthDays(v: View, calendar: CalendarKind): { key: DayKey; day: number }[] {
  const len =
    calendar === "jalali" ? jalaliMonthLength(v.year, v.month) : new Date(Date.UTC(v.year, v.month, 0)).getUTCDate();
  return Array.from({ length: len }, (_, i) => ({
    key: calendar === "jalali" ? dayKeyFromJalali(v.year, v.month, i + 1) : gregorianKey(v.year, v.month, i + 1),
    day: i + 1,
  }));
}

// Iranian weeks start on Saturday; Gregorian view starts on Monday.
const WEEK_START: Record<CalendarKind, number> = { jalali: 6, gregorian: 1 };
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function CalendarGrid({
  selected,
  rangeStart,
  rangeEnd,
  onSelect,
  initialKey,
}: {
  selected?: DayKey | null;
  rangeStart?: DayKey | null;
  rangeEnd?: DayKey | null;
  onSelect: (key: DayKey) => void;
  initialKey?: DayKey | null;
}) {
  const { calendar } = usePrefs();
  const today = dayKeyOf(new Date());
  const [view, setView] = useState<View>(() => viewOf(initialKey ?? selected ?? rangeStart ?? today, calendar));
  const days = useMemo(() => monthDays(view, calendar), [view, calendar]);
  const lead = (weekdayOfKey(days[0]!.key) - WEEK_START[calendar] + 7) % 7;
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(WEEK_START[calendar] + i) % 7]!);
  const title =
    calendar === "jalali"
      ? `${JALALI_MONTHS_EN[view.month - 1]} ${view.year}`
      : `${GREGORIAN_MONTHS_EN[view.month - 1]} ${view.year}`;

  return (
    <div className="w-[17rem] select-none">
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setView(shiftView(view, -1, calendar))}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setView(shiftView(view, 1, calendar))}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w) => (
          <span key={w} className="py-1 text-[0.7rem] font-medium text-muted-foreground">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map(({ key, day }) => {
          const isSelected = key === selected || key === rangeStart || key === rangeEnd;
          const inRange = rangeStart && rangeEnd && key > rangeStart && key < rangeEnd;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={key}
              className={cn(
                "amount grid aspect-square place-items-center rounded-lg text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                key === today && !isSelected && "text-primary font-semibold",
                inRange && "rounded-none bg-primary/15",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setView(viewOf(today, calendar));
            onSelect(today);
          }}
        >
          Today
        </Button>
      </div>
    </div>
  );
}

function formatKey(key: DayKey, calendar: CalendarKind): string {
  const d = parseDayKey(key);
  if (!d) return key;
  // Noon avoids any edge with timezone conversion of a date-only value.
  return formatDate(new Date(Date.UTC(d.year, d.month - 1, d.day, 9)), { calendar });
}

/** Single date picker; value is a Tehran-local DayKey ("2026-10-15"). */
export function DatePicker({
  value,
  onChange,
  id,
  className,
}: {
  value: DayKey;
  onChange: (key: DayKey) => void;
  id?: string;
  className?: string;
}) {
  const { calendar } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn("h-9 justify-start gap-2 font-normal", className)}
        >
          <CalendarDays className="text-muted-foreground" />
          <span className="amount">{formatKey(value, calendar)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <CalendarGrid
          selected={value}
          onSelect={(k) => {
            onChange(k);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export type DateRange = { from: DayKey | null; to: DayKey | null };

export type RangePreset = { label: string; range: DateRange };

/** Range picker with presets; the second click closes the range (order-independent). */
export function DateRangePicker({
  value,
  onChange,
  presets,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets: RangePreset[];
  className?: string;
}) {
  const { calendar } = usePrefs();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DayKey | null>(null);
  const active = presets.find((p) => p.range.from === value.from && p.range.to === value.to);
  const label = active
    ? active.label
    : value.from || value.to
      ? `${value.from ? formatKey(value.from, calendar) : "…"} – ${value.to ? formatKey(value.to, calendar) : "…"}`
      : "All time";

  function pick(key: DayKey) {
    if (!pending) {
      setPending(key);
      return;
    }
    const [from, to] = pending <= key ? [pending, key] : [key, pending];
    setPending(null);
    onChange({ from, to });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPending(null);
      }}
    >
      <div className={cn("flex items-center", className)}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-9 justify-start gap-2 font-normal">
            <CalendarDays className="text-muted-foreground" />
            <span className="amount truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        {(value.from || value.to) && !active?.range.from && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear dates"
            onClick={() => onChange({ from: null, to: null })}
          >
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="flex w-auto flex-col gap-3 p-3 sm:flex-row" align="start">
        <div className="flex flex-row flex-wrap gap-1 sm:w-36 sm:flex-col">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant={active?.label === p.label ? "secondary" : "ghost"}
              size="sm"
              className="justify-start"
              onClick={() => {
                onChange(p.range);
                setPending(null);
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div>
          <CalendarGrid
            rangeStart={pending ?? value.from}
            rangeEnd={pending ? null : value.to}
            onSelect={pick}
            initialKey={value.to ?? value.from}
          />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {pending ? "Pick the end date" : "Pick a start date"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
