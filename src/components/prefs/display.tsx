"use client";

import { cn } from "cn";
import { formatMoney, type FormatMoneyOptions } from "@/lib/format/money";
import { formatDate, type FormatDateOptions } from "@/lib/format/time";
import { usePrefs } from "./prefs-provider";

type TxKind = "expense" | "income" | "transfer" | "refund";

/** Amount in the user's display unit. With `kind`, applies sign and income/expense color. */
export function Money({
  rial,
  kind,
  direction,
  className,
  colored = true,
  ...opts
}: { rial: number; kind?: TxKind; direction?: "in" | "out"; className?: string; colored?: boolean } & Omit<
  FormatMoneyOptions,
  "unit" | "digits"
>) {
  const prefs = usePrefs();
  let value = rial;
  let sign = opts.sign;
  let tone: string | undefined;
  if (kind) {
    if (kind === "transfer") {
      tone = "text-transfer";
      value = direction === "out" ? -Math.abs(rial) : Math.abs(rial);
      sign = direction ? "always" : "never";
    } else {
      const out = kind === "expense" || direction === "out";
      value = out ? -Math.abs(rial) : Math.abs(rial);
      sign = "always";
      tone = out ? "text-expense" : "text-income";
    }
  }
  return (
    <span className={cn("amount whitespace-nowrap", colored && tone, className)} dir="ltr">
      {formatMoney(value, { ...opts, sign, unit: prefs.unit, digits: prefs.digits })}
    </span>
  );
}

export function useMoneyFormatter() {
  const prefs = usePrefs();
  return (rial: number, opts: Omit<FormatMoneyOptions, "unit" | "digits"> = {}) =>
    formatMoney(rial, { ...opts, unit: prefs.unit, digits: prefs.digits });
}

export function DateTime({
  date,
  className,
  ...opts
}: { date: Date | string; className?: string } & Omit<FormatDateOptions, "calendar" | "digits">) {
  const prefs = usePrefs();
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} className={cn("amount whitespace-nowrap", className)}>
      {formatDate(d, { ...opts, calendar: prefs.calendar, digits: prefs.digits })}
    </time>
  );
}
