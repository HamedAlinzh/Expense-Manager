"use client";

import { cn } from "cn";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { type MoneyUnit, parseAmountToRial, rialToUnit, UNIT_LABELS } from "@/lib/format/money";

const DECIMALS: Record<MoneyUnit, number> = { rial: 0, toman: 1, thousand_toman: 4 };

/** Converts stored Rial into the editable string shown in an AmountInput, e.g. "1,250,000". */
export function rialToInputString(rial: number | null | undefined, unit: MoneyUnit): string {
  if (rial === null || rial === undefined) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: DECIMALS[unit], useGrouping: true }).format(
    rialToUnit(rial, unit),
  );
}

/** Parses an AmountInput string (in the display unit) to Rial; null when empty or invalid. */
export function inputStringToRial(value: string, unit: MoneyUnit): number | null {
  return parseAmountToRial(value, unit);
}

/**
 * Text input for money in the user's display unit. Keeps the raw string so users can type
 * Persian digits and separators; callers convert with `inputStringToRial`.
 */
export function AmountInput({
  value,
  onChange,
  id,
  className,
  autoFocus,
  placeholder = "0",
  "aria-invalid": ariaInvalid,
  size = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  "aria-invalid"?: boolean;
  size?: "default" | "lg";
}) {
  const { unit } = usePrefs();
  const invalid = ariaInvalid || (value.trim() !== "" && parseAmountToRial(value, unit) === null);
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-input bg-input/30 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid && "border-destructive focus-within:border-destructive focus-within:ring-destructive/30",
        size === "lg" ? "h-14 px-4" : "h-9 px-2.5",
        className,
      )}
    >
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          // Tidy valid input into grouped Western digits ("۱۲۵۰۰۰۰" → "1,250,000").
          const rial = parseAmountToRial(value, unit);
          if (rial !== null && value.trim() !== "") onChange(rialToInputString(rial, unit));
        }}
        className={cn(
          "amount w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60",
          size === "lg" ? "text-2xl font-semibold" : "text-sm",
        )}
      />
      <span className={cn("shrink-0 pl-2 text-muted-foreground", size === "lg" ? "text-base" : "text-xs")}>
        {UNIT_LABELS[unit].long}
      </span>
    </div>
  );
}
