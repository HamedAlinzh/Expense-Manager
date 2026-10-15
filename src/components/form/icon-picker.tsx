"use client";

import { cn } from "cn";
import { CATEGORY_ICON_NAMES, CATEGORY_ICONS } from "@/lib/category-icons";

export function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (name: string) => void;
  color: string;
}) {
  return (
    <div
      className="grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border border-border p-2"
      role="radiogroup"
      aria-label="Icon"
    >
      {CATEGORY_ICON_NAMES.map((name) => {
        const Icon = CATEGORY_ICONS[name]!;
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            onClick={() => onChange(name)}
            className={cn(
              "grid aspect-square place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected && "text-foreground",
            )}
            style={selected ? { backgroundColor: `${color}26`, color } : undefined}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
