"use client";

import { cn } from "cn";
import type { CardLite } from "@/components/app-data";

export function CardDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-2 ring-black/20", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export function CardBadge({ card, className }: { card: CardLite | null | undefined; className?: string }) {
  if (!card) return <span className={cn("text-xs text-muted-foreground", className)}>No card</span>;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        borderColor: `${card.color}55`,
        backgroundColor: `${card.color}1a`,
        color: `color-mix(in oklch, ${card.color} 70%, white)`,
      }}
    >
      <CardDot color={card.color} className="size-2 ring-0" />
      <span className="truncate">{card.name}</span>
    </span>
  );
}

/** Chip-style single card selector — quick to tap on phones. */
export function CardPicker({
  cards,
  value,
  onChange,
  allowNone,
  label,
}: {
  cards: CardLite[];
  value: number | null;
  onChange: (id: number | null) => void;
  allowNone?: boolean;
  label?: string;
}) {
  const visible = cards.filter((c) => !c.archived || c.id === value);
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label ?? "Card"}>
      {visible.map((c) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(c.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected
                ? "border-transparent text-foreground shadow-sm"
                : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
            style={
              selected ? { backgroundColor: `${c.color}2e`, boxShadow: `inset 0 0 0 1.5px ${c.color}` } : undefined
            }
          >
            <CardDot color={c.color} />
            {c.name}
          </button>
        );
      })}
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "rounded-xl border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === null
              ? "border-foreground/40 text-foreground"
              : "border-dashed border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Cash / none
        </button>
      )}
    </div>
  );
}
