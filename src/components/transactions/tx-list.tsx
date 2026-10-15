"use client";

import { ArrowLeftRight, Check } from "lucide-react";
import { cn } from "cn";
import { useAppData } from "@/components/app-data";
import { CategoryDot } from "@/components/categories/category-badge";
import { Money } from "@/components/prefs/display";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { dayKeyOf, formatTime, relativeDayLabel } from "@/lib/format/time";
import type { TxListRow } from "@/server/queries/transactions";
import { CardBadge, CardDot } from "./card-picker";
import { CategoryCell, NoteTagsEditor, transferLabel } from "./tx-inline";
import { MatchedIcon, SourceIcon, StatusPill } from "./tx-meta";

type Group = { key: string; label: string; rows: TxListRow[]; spentRial: number; incomeRial: number };

function groupByDay(rows: TxListRow[], calendar: "jalali" | "gregorian"): Group[] {
  const groups: Group[] = [];
  for (const r of rows) {
    const d = new Date(r.occurredAt);
    const key = dayKeyOf(d);
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: relativeDayLabel(d, calendar), rows: [], spentRial: 0, incomeRial: 0 };
      groups.push(g);
    }
    g.rows.push(r);
    if (r.type === "expense") g.spentRial += r.amountRial;
    else if (r.type === "income" || r.type === "refund") g.incomeRial += r.amountRial;
  }
  return groups;
}

function title(r: TxListRow) {
  return (
    r.merchant ||
    r.description ||
    (r.type === "transfer" ? (r.direction === "out" ? "Transfer out" : "Transfer in") : "Untitled")
  );
}

function subtitle(r: TxListRow) {
  return r.merchant && r.description && r.description !== r.merchant ? r.description : null;
}

export type ListProps = {
  rows: TxListRow[];
  selected: Set<number>;
  selectionMode: boolean;
  onToggle: (id: number, shiftKey: boolean) => void;
  onToggleAll: (ids: number[], on: boolean) => void;
  onOpen: (id: number) => void;
};

export function TxList(props: ListProps) {
  const { calendar } = usePrefs();
  const groups = groupByDay(props.rows, calendar);
  return (
    <>
      <DesktopTable {...props} groups={groups} />
      <MobileList {...props} groups={groups} />
    </>
  );
}

function DayTotals({ g }: { g: Group }) {
  return (
    <span className="flex items-center gap-3 text-xs font-normal">
      {g.incomeRial > 0 && <Money rial={g.incomeRial} kind="income" />}
      {g.spentRial > 0 && <Money rial={g.spentRial} kind="expense" />}
    </span>
  );
}

function DesktopTable({ groups, selected, onToggle, onToggleAll, onOpen, rows }: ListProps & { groups: Group[] }) {
  const { cards } = useAppData();
  const { digits } = usePrefs();
  const allIds = rows.map((r) => r.id);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someOn = allIds.some((id) => selected.has(id));

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-11" />
          <col className="w-16" />
          <col className="w-32" />
          <col />
          <col className="w-48" />
          <col className="w-40" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2.5 pl-4">
              <Checkbox
                checked={allOn ? true : someOn ? "indeterminate" : false}
                onCheckedChange={(v) => onToggleAll(allIds, v === true)}
                aria-label="Select all on this page"
              />
            </th>
            <th className="py-2.5 font-medium">Time</th>
            <th className="py-2.5 font-medium">Card</th>
            <th className="py-2.5 font-medium">Description</th>
            <th className="py-2.5 font-medium">Category</th>
            <th className="py-2.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-2.5 pr-4 text-right font-medium">Source</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            <tr className="bg-muted/30">
              <th colSpan={5} className="py-2 pl-4 text-left text-xs font-medium text-muted-foreground">
                {g.label}
              </th>
              <th colSpan={2} className="py-2 pr-4">
                <div className="flex justify-end">
                  <DayTotals g={g} />
                </div>
              </th>
            </tr>
            {g.rows.map((r) => {
              const isSelected = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  onClick={(e) => {
                    // React bubbles events from portals (popovers) through the tree; only react to clicks inside the row itself.
                    if (!e.currentTarget.contains(e.target as Node)) return;
                    if ((e.target as HTMLElement).closest("button,a,input,[role=checkbox],[data-no-row-click]")) return;
                    onOpen(r.id);
                  }}
                  className={cn(
                    "group cursor-pointer border-t border-border/60 transition-colors hover:bg-accent/40",
                    isSelected && "bg-primary/[0.07] hover:bg-primary/10",
                  )}
                >
                  <td className="py-2.5 pl-4" data-no-row-click>
                    <Checkbox
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(r.id, e.shiftKey);
                      }}
                      aria-label={`Select ${title(r)}`}
                    />
                  </td>
                  <td className="amount py-2.5 text-xs text-muted-foreground">
                    {formatTime(new Date(r.occurredAt), digits)}
                  </td>
                  <td className="py-2.5 pr-2">
                    <CardBadge card={cards.find((c) => c.id === r.cardId)} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium" dir="auto">
                          {title(r)}
                        </p>
                        {(subtitle(r) || r.tags.length > 0) && (
                          <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {subtitle(r) && (
                              <span className="truncate" dir="auto">
                                {subtitle(r)}
                              </span>
                            )}
                            {r.tags.map((t) => (
                              <span key={t} className="shrink-0 rounded bg-muted px-1 text-[0.68rem]">
                                #{t}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                      <NoteTagsEditor row={r} />
                    </div>
                  </td>
                  <td className="py-2.5 pr-2">
                    <CategoryCell row={r} onOpenDetail={() => onOpen(r.id)} />
                  </td>
                  <td className="py-2.5 pr-4 text-right font-medium">
                    <Money rial={r.amountRial} kind={r.type} direction={r.direction} />
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <StatusPill status={r.status} />
                      {r.reconciledAt && <MatchedIcon />}
                      <SourceIcon source={r.source} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function MobileList({ groups, selected, selectionMode, onToggle, onOpen }: ListProps & { groups: Group[] }) {
  const { cards, categories } = useAppData();
  return (
    <div className="flex flex-col gap-5 md:hidden">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
            <span>{g.label}</span>
            <DayTotals g={g} />
          </div>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
            {g.rows.map((r) => {
              const card = cards.find((c) => c.id === r.cardId);
              const category = categories.find((c) => c.id === r.categoryId);
              const isSelected = selected.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={selectionMode ? isSelected : undefined}
                    onClick={() => (selectionMode ? onToggle(r.id, false) : onOpen(r.id))}
                    className={cn(
                      "flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-accent/60",
                      isSelected && "bg-primary/10",
                    )}
                  >
                    {selectionMode ? (
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                        )}
                      >
                        {isSelected && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    ) : r.type === "transfer" ? (
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-transfer">
                        <ArrowLeftRight className="size-4" />
                      </span>
                    ) : category ? (
                      <CategoryDot category={category} size="lg" />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                        ?
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" dir="auto">
                        {title(r)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {card && <CardDot color={card.color} className="size-2 ring-0" />}
                        <span className="truncate">
                          {[
                            card?.name,
                            r.type === "transfer"
                              ? transferLabel(r, cards)
                              : r.splitCount
                                ? `Split · ${r.splitCount}`
                                : category?.name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money
                        rial={r.amountRial}
                        kind={r.type}
                        direction={r.direction}
                        className="text-sm font-semibold"
                      />
                      <span className="flex items-center gap-1">
                        <StatusPill status={r.status} />
                        <span className="amount text-[0.7rem] text-muted-foreground">
                          {formatTime(new Date(r.occurredAt))}
                        </span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
