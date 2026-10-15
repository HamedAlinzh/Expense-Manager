"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryBadge, CategoryDot, type CategoryLite } from "./category-badge";

/** Orders categories as parent, then its children, for display in pickers and lists. */
export function sortCategoryTree<T extends CategoryLite>(list: T[]): (T & { depth: number })[] {
  const parents = list.filter((c) => c.parentId === null || !list.some((p) => p.id === c.parentId));
  return parents.flatMap((p) => [
    { ...p, depth: 0 },
    ...list.filter((c) => c.parentId === p.id).map((c) => ({ ...c, depth: 1 })),
  ]);
}

export function CategoryCommandList({
  categories,
  value,
  onSelect,
  kinds = ["expense", "income"],
  allowNone,
}: {
  categories: CategoryLite[];
  value: number | null;
  onSelect: (id: number | null) => void;
  kinds?: ("expense" | "income")[];
  allowNone?: boolean;
}) {
  const visible = categories.filter((c) => !c.archived || c.id === value);
  return (
    <Command>
      <CommandInput placeholder="Search categories…" />
      <CommandList>
        <CommandEmpty>No category found.</CommandEmpty>
        {allowNone && (
          <CommandGroup>
            <CommandItem value="__none uncategorized" onSelect={() => onSelect(null)}>
              <span className="size-5" />
              <span className="text-muted-foreground italic">Uncategorized</span>
              {value === null && <Check className="ml-auto" />}
            </CommandItem>
          </CommandGroup>
        )}
        {kinds.map((kind) => (
          <CommandGroup key={kind} heading={kinds.length > 1 ? (kind === "expense" ? "Expense" : "Income") : undefined}>
            {sortCategoryTree(visible.filter((c) => c.kind === kind)).map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.id}`}
                onSelect={() => onSelect(c.id)}
                className={cn(c.depth && "pl-6")}
              >
                <CategoryDot category={c} size="sm" />
                <span dir="auto">{c.name}</span>
                {value === c.id && <Check className="ml-auto" />}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

/** Searchable category picker (Popover + Command). */
export function CategorySelect({
  categories,
  value,
  onChange,
  kinds,
  allowNone = true,
  id,
  className,
  trigger,
}: {
  categories: CategoryLite[];
  value: number | null;
  onChange: (id: number | null) => void;
  kinds?: ("expense" | "income")[];
  allowNone?: boolean;
  id?: string;
  className?: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-9 w-full justify-between font-normal", className)}
          >
            <CategoryBadge category={selected} />
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <CategoryCommandList
          categories={categories}
          value={value}
          kinds={kinds}
          allowNone={allowNone}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
