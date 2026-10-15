"use client";

import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  CreditCard,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { createSavedView, deleteSavedView } from "@/app/(app)/transactions/actions";
import { useAppData } from "@/components/app-data";
import { CategoryDot } from "@/components/categories/category-badge";
import { sortCategoryTree } from "@/components/categories/category-select";
import { AmountInput, inputStringToRial, rialToInputString } from "@/components/form/amount-input";
import { type DateRange, DateRangePicker, type RangePreset } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { TagInput } from "@/components/form/tag-input";
import { useMoneyFormatter } from "@/components/prefs/display";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { JALALI_MONTHS_EN, jalaliMonthLength } from "@/lib/format/jalali";
import { addDaysToKey, currentJalaliMonth, dayKeyFromJalali, dayKeyOf, toJalaliParts } from "@/lib/format/time";
import { addJalaliMonths } from "@/lib/format/jalali";
import {
  SOURCE_LABELS,
  TX_SOURCES,
  TX_TYPES,
  type TxFilters,
  type TxSource,
  type TxType,
  TYPE_LABELS,
  activeFilterCount,
  emptyFilters,
  filtersToParams,
} from "@/lib/schemas/transaction";

function monthPreset(jy: number, jm: number, label: string): RangePreset {
  return {
    label,
    range: { from: dayKeyFromJalali(jy, jm, 1), to: dayKeyFromJalali(jy, jm, jalaliMonthLength(jy, jm)) },
  };
}

export function useDatePresets(): RangePreset[] {
  return useMemo(() => {
    const today = dayKeyOf(new Date());
    const { jy, jm } = currentJalaliMonth();
    const prev = addJalaliMonths(jy, jm, -1);
    const { jy: year } = toJalaliParts(new Date());
    return [
      monthPreset(jy, jm, `This month · ${JALALI_MONTHS_EN[jm - 1]}`),
      monthPreset(prev.jy, prev.jm, `Last month · ${JALALI_MONTHS_EN[prev.jm - 1]}`),
      { label: "Last 30 days", range: { from: addDaysToKey(today, -29), to: today } },
      { label: "Last 90 days", range: { from: addDaysToKey(today, -89), to: today } },
      { label: `This year · ${year}`, range: { from: dayKeyFromJalali(year, 1, 1), to: today } },
      { label: "All time", range: { from: null, to: null } },
    ];
  }, []);
}

type SavedView = { id: number; name: string; filters: unknown };

export function FilterBar({
  filters,
  onChange,
  savedViews,
  tagSuggestions,
}: {
  filters: TxFilters;
  onChange: (next: TxFilters) => void;
  savedViews: SavedView[];
  tagSuggestions: string[];
}) {
  const { cards, categories } = useAppData();
  const presets = useDatePresets();
  const [q, setQ] = useState(filters.q ?? "");
  const lastPushed = useRef(filters.q ?? "");

  // Debounced search → URL. Also follow external changes (e.g. "Clear all").
  useEffect(() => {
    if ((filters.q ?? "") !== lastPushed.current) {
      lastPushed.current = filters.q ?? "";
      setQ(filters.q ?? "");
    }
  }, [filters.q]);
  useEffect(() => {
    if (q === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = q;
      onChange({ ...filters, q: q.trim() || undefined, page: 1 });
    }, 350);
    return () => clearTimeout(t);
  }, [q, filters, onChange]);

  const update = (patch: Partial<TxFilters>) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description, merchant, note…"
            className="h-9 pl-9"
            dir="auto"
            aria-label="Search transactions"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <DateRangePicker
          value={{ from: filters.from ?? null, to: filters.to ?? null }}
          onChange={(r: DateRange) => update({ from: r.from ?? undefined, to: r.to ?? undefined })}
          presets={presets}
        />
        <MultiSelectPopover
          icon={<CreditCard />}
          label="Cards"
          count={filters.cards.length}
          items={cards.map((c) => ({
            id: c.id,
            label: c.name,
            leading: <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />,
          }))}
          selected={filters.cards}
          onChange={(ids) => update({ cards: ids })}
        />
        <MultiSelectPopover
          icon={<Tags />}
          label="Categories"
          count={filters.categories.length}
          searchable
          items={[
            { id: 0, label: "Uncategorized", leading: <span className="size-5" /> },
            ...sortCategoryTree(categories.filter((c) => !c.archived || filters.categories.includes(c.id))).map(
              (c) => ({
                id: c.id,
                label: c.name,
                group: c.kind === "expense" ? "Expense" : "Income",
                indent: c.depth > 0,
                leading: <CategoryDot category={c} size="sm" />,
              }),
            ),
          ]}
          selected={filters.categories}
          onChange={(ids) => update({ categories: ids })}
        />
        <MoreFilters filters={filters} onChange={update} tagSuggestions={tagSuggestions} />
        <ViewsMenu filters={filters} savedViews={savedViews} />
      </div>
      <ActiveChips filters={filters} onChange={onChange} presets={presets} />
    </div>
  );
}

type MultiItem = { id: number; label: string; leading?: ReactNode; group?: string; indent?: boolean };

function MultiSelectPopover({
  icon,
  label,
  count,
  items,
  selected,
  onChange,
  searchable,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  items: MultiItem[];
  selected: number[];
  onChange: (ids: number[]) => void;
  searchable?: boolean;
}) {
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const groups = [...new Set(items.map((i) => i.group ?? ""))];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 font-normal", count > 0 && "border-primary/50 text-foreground")}>
          {icon}
          {label}
          {count > 0 && <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5">{count}</Badge>}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList className="max-h-72">
            <CommandEmpty>Nothing found.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g || "_"} heading={g || undefined}>
                {items
                  .filter((i) => (i.group ?? "") === g)
                  .map((i) => (
                    <CommandItem
                      key={i.id}
                      value={`${i.label} ${i.id}`}
                      onSelect={() => toggle(i.id)}
                      className={cn(i.indent && "pl-6")}
                    >
                      <Checkbox checked={selected.includes(i.id)} className="pointer-events-none" tabIndex={-1} />
                      {i.leading}
                      <span dir="auto" className="truncate">
                        {i.label}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
          {count > 0 && (
            <div className="border-t border-border p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ToggleChips<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {on && <Check className="mr-1 inline size-3" />}
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}

function MoreFilters({
  filters,
  onChange,
  tagSuggestions,
}: {
  filters: TxFilters;
  onChange: (p: Partial<TxFilters>) => void;
  tagSuggestions: string[];
}) {
  const { unit } = usePrefs();
  const [min, setMin] = useState(rialToInputString(filters.minRial, unit));
  const [max, setMax] = useState(rialToInputString(filters.maxRial, unit));
  const count =
    (filters.types.length ? 1 : 0) +
    (filters.sources.length ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.tags.length ? 1 : 0) +
    (filters.minRial !== undefined || filters.maxRial !== undefined ? 1 : 0);

  function applyAmounts() {
    const minR = min.trim() ? inputStringToRial(min, unit) : null;
    const maxR = max.trim() ? inputStringToRial(max, unit) : null;
    if ((min.trim() && minR === null) || (max.trim() && maxR === null)) return;
    onChange({ minRial: minR ?? undefined, maxRial: maxR ?? undefined });
  }

  return (
    <Popover
      onOpenChange={(o) => {
        if (o) {
          setMin(rialToInputString(filters.minRial, unit));
          setMax(rialToInputString(filters.maxRial, unit));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 font-normal", count > 0 && "border-primary/50")}>
          <SlidersHorizontal />
          More
          {count > 0 && <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5">{count}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-4" align="end">
        <Field label="Type">
          <ToggleChips
            options={TX_TYPES}
            labels={TYPE_LABELS}
            value={filters.types}
            onChange={(types: TxType[]) => onChange({ types })}
          />
        </Field>
        <Field label="Status">
          <ToggleChips
            options={["pending_review", "confirmed"] as const}
            labels={{ pending_review: "Needs review", confirmed: "Confirmed" }}
            value={filters.status ? [filters.status] : []}
            onChange={(v) => onChange({ status: v.at(-1) })}
          />
        </Field>
        <Field label="Source">
          <ToggleChips
            options={TX_SOURCES}
            labels={SOURCE_LABELS}
            value={filters.sources}
            onChange={(sources: TxSource[]) => onChange({ sources })}
          />
        </Field>
        <Field label="Amount range">
          <div className="grid grid-cols-2 gap-2">
            <AmountInput value={min} onChange={setMin} placeholder="Min" />
            <AmountInput value={max} onChange={setMax} placeholder="Max" />
          </div>
          <Button size="sm" variant="secondary" className="mt-1 self-end" onClick={applyAmounts}>
            Apply range
          </Button>
        </Field>
        <Field label="Tags (any of)">
          <TagInput
            value={filters.tags}
            onChange={(tags) => onChange({ tags: tags.map((t) => t.replace(/^#/, "").toLowerCase()) })}
            prefix="#"
            placeholder="Type a tag"
          />
          {tagSuggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tagSuggestions
                .filter((t) => !filters.tags.includes(t))
                .slice(0, 12)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onChange({ tags: [...filters.tags, t] })}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    #{t}
                  </button>
                ))}
            </div>
          )}
        </Field>
      </PopoverContent>
    </Popover>
  );
}

function ActiveChips({
  filters,
  onChange,
  presets,
}: {
  filters: TxFilters;
  onChange: (f: TxFilters) => void;
  presets: RangePreset[];
}) {
  const { cards, categories } = useAppData();
  const fmt = useMoneyFormatter();
  if (activeFilterCount(filters) === 0) return null;
  const set = (patch: Partial<TxFilters>) => onChange({ ...filters, ...patch, page: 1 });
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (filters.from || filters.to) {
    const preset = presets.find((p) => p.range.from === (filters.from ?? null) && p.range.to === (filters.to ?? null));
    chips.push({
      key: "date",
      label: preset?.label ?? "Custom dates",
      clear: () => set({ from: undefined, to: undefined }),
    });
  }
  for (const id of filters.cards) {
    chips.push({
      key: `card${id}`,
      label: cards.find((c) => c.id === id)?.name ?? `Card ${id}`,
      clear: () => set({ cards: filters.cards.filter((x) => x !== id) }),
    });
  }
  for (const id of filters.categories) {
    chips.push({
      key: `cat${id}`,
      label: id === 0 ? "Uncategorized" : (categories.find((c) => c.id === id)?.name ?? `Category ${id}`),
      clear: () => set({ categories: filters.categories.filter((x) => x !== id) }),
    });
  }
  for (const t of filters.types)
    chips.push({
      key: `type${t}`,
      label: TYPE_LABELS[t],
      clear: () => set({ types: filters.types.filter((x) => x !== t) }),
    });
  for (const s of filters.sources)
    chips.push({
      key: `src${s}`,
      label: SOURCE_LABELS[s],
      clear: () => set({ sources: filters.sources.filter((x) => x !== s) }),
    });
  if (filters.status)
    chips.push({
      key: "status",
      label: filters.status === "pending_review" ? "Needs review" : "Confirmed",
      clear: () => set({ status: undefined }),
    });
  for (const t of filters.tags)
    chips.push({ key: `tag${t}`, label: `#${t}`, clear: () => set({ tags: filters.tags.filter((x) => x !== t) }) });
  if (filters.minRial !== undefined || filters.maxRial !== undefined) {
    const label = `${filters.minRial !== undefined ? fmt(filters.minRial) : "0"} – ${filters.maxRial !== undefined ? fmt(filters.maxRial) : "∞"}`;
    chips.push({ key: "amount", label, clear: () => set({ minRial: undefined, maxRial: undefined }) });
  }
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, clear: () => set({ q: undefined }) });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-1 pl-2.5 text-xs"
          dir="auto"
        >
          {c.label}
          <button
            type="button"
            onClick={c.clear}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Remove filter ${c.label}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange(emptyFilters)}>
        Clear all
      </Button>
    </div>
  );
}

function ViewsMenu({ filters, savedViews }: { filters: TxFilters; savedViews: SavedView[] }) {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const query = filtersToParams({ ...filters, page: 1 }).toString();
  const viewQuery = (v: SavedView) => (v.filters as { query?: string } | null)?.query ?? "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 font-normal" aria-label="Saved views">
            <Bookmark />
            <span className="hidden sm:inline">Views</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {savedViews.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Save filter combinations you use often.</p>
          )}
          {savedViews.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={() => router.push(`/transactions?${viewQuery(v)}`)}
              className="group"
            >
              <Bookmark className={cn(viewQuery(v) === query && "fill-primary text-primary")} />
              <span className="flex-1 truncate" dir="auto">
                {v.name}
              </span>
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  startTransition(async () => {
                    const res = await deleteSavedView({ id: v.id });
                    if (!res.ok) toast.error(res.error);
                  });
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!query} onSelect={() => setSaveOpen(true)}>
            <BookmarkPlus /> Save current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await createSavedView({ name, query });
                if (res.ok) {
                  toast.success("View saved");
                  setSaveOpen(false);
                  setName("");
                } else toast.error(res.error);
              });
            }}
            className="flex flex-col gap-4"
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Snapp rides this year"
              autoFocus
              dir="auto"
            />
            <DialogFooter>
              <Button type="submit" disabled={pending || !name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
