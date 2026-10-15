"use client";

import { Nfc } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/prefs/display";
import { BANK_LABELS } from "@/lib/schemas/card";
import { timeAgo } from "@/lib/format/time";

export type CardVisualData = {
  name: string;
  bank: keyof typeof BANK_LABELS;
  color: string;
  cardType: "debit" | "credit";
  identifierFragments: string[];
  lastKnownBalanceRial: number | null;
  balanceUpdatedAt: Date | string | null;
  archived?: boolean;
};

export function maskedNumber(fragments: string[]): string {
  const digits = fragments[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "•••• ••••";
}

/** Mini credit-card rendering in the card's own color. */
export function CardVisual({
  card,
  className,
  compact,
}: {
  card: CardVisualData;
  className?: string;
  compact?: boolean;
}) {
  const updated = card.balanceUpdatedAt ? new Date(card.balanceUpdatedAt) : null;
  return (
    <div
      className={cn(
        "relative isolate flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl text-white shadow-xl shadow-black/30 ring-1 ring-white/10",
        compact ? "p-3.5" : "p-5",
        card.archived && "opacity-50 grayscale",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${card.color} 0%, color-mix(in oklch, ${card.color} 45%, #09090b) 100%)`,
      }}
    >
      {/* sheen + depth */}
      <div aria-hidden className="absolute -top-1/2 -right-1/4 -z-10 size-[120%] rounded-full bg-white/10 blur-2xl" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-black/45 to-transparent"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate font-semibold tracking-tight drop-shadow", compact ? "text-sm" : "text-lg")}>
            {card.name}
          </p>
          <p className="font-persian text-xs text-white/75" lang="fa">
            {BANK_LABELS[card.bank].fa}
          </p>
        </div>
        <span className="rounded-full bg-black/25 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase backdrop-blur">
          {card.cardType}
        </span>
      </div>

      {!compact && (
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200/90 to-amber-500/80 ring-1 ring-black/10"
            aria-hidden
          />
          <Nfc className="size-5 rotate-90 text-white/70" aria-hidden />
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <span className={cn("amount font-medium tracking-widest text-white/90", compact ? "text-xs" : "text-sm")}>
          {maskedNumber(card.identifierFragments)}
        </span>
        <div className="text-right">
          {card.lastKnownBalanceRial !== null ? (
            <>
              <Money
                rial={card.lastKnownBalanceRial}
                className={cn("font-semibold drop-shadow", compact ? "text-sm" : "text-base")}
              />
              {updated && !compact && <p className="text-[0.65rem] text-white/65">updated {timeAgo(updated)}</p>}
            </>
          ) : (
            <span className="text-xs text-white/65">Balance unknown</span>
          )}
        </div>
      </div>
    </div>
  );
}
