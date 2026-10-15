"use client";

import { Check } from "lucide-react";
import { cn } from "cn";
import { COLOR_SWATCHES } from "@/lib/category-icons";

export function ColorPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (color: string) => void;
  id?: string;
}) {
  const custom = !COLOR_SWATCHES.includes(value.toLowerCase());
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color" id={id}>
      {COLOR_SWATCHES.map((c) => {
        const selected = value.toLowerCase() === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              "grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected && "ring-2 ring-foreground/70",
            )}
            style={{ backgroundColor: c }}
          >
            {selected && <Check className="size-3.5 text-black/70" strokeWidth={3} />}
          </button>
        );
      })}
      <label
        className={cn(
          "relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-muted-foreground/50 text-[0.6rem] text-muted-foreground ring-offset-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring",
          custom && "border-solid ring-2 ring-foreground/70",
        )}
        style={custom ? { backgroundColor: value } : undefined}
        title="Custom color"
      >
        {!custom && "+"}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Custom color"
        />
      </label>
    </div>
  );
}
