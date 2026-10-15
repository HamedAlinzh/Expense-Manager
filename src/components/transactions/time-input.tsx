"use client";

import { useState } from "react";
import { cn } from "cn";
import { normalizeDigits } from "@/lib/format/text";

/** Normalizes loose input ("930", "9:3", "۱۴۳۲", "14.32") to "HH:MM", or null if it isn't a valid time. */
export function normalizeTimeInput(raw: string): string | null {
  const s = normalizeDigits(raw)
    .trim()
    .replace(/[.\s٫]/g, ":");
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  const digits = /^(\d{3,4})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (digits) {
    h = Number(s.slice(0, -2));
    m = Number(s.slice(-2));
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 24-hour time field (native time inputs follow the browser locale and may show AM/PM). */
export function TimeInput({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const invalid = normalizeTimeInput(draft) === null;
  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      maxLength={5}
      value={draft}
      placeholder="HH:MM"
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        const t = normalizeTimeInput(e.target.value);
        if (t && e.target.value.length >= 4) onChange(t);
      }}
      onBlur={() => {
        const t = normalizeTimeInput(draft);
        if (t) {
          setDraft(t);
          onChange(t);
        } else setDraft(value);
      }}
      className={cn(
        "amount h-9 w-20 rounded-lg border border-input bg-input/30 px-2.5 text-center text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50",
        invalid && "border-destructive",
        className,
      )}
    />
  );
}
