"use client";

import { ArrowLeftRight, ChevronDown, NotebookPen } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { createRuleFromSuggestion, type RuleSuggestion, updateTransaction } from "@/app/(app)/transactions/actions";
import { useAppData } from "@/components/app-data";
import { CategoryBadge } from "@/components/categories/category-badge";
import { CategoryCommandList } from "@/components/categories/category-select";
import { TagInput } from "@/components/form/tag-input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { TxListRow } from "@/server/queries/transactions";
import { SplitBadge } from "./tx-meta";

/** Toast offering "Always categorize 'X' as Y?" after a manual category change. */
export function offerRule(suggestion: RuleSuggestion | null | undefined) {
  if (!suggestion) return;
  toast(`Always categorize “${suggestion.pattern}” as ${suggestion.categoryName}?`, {
    description: "Creates a rule for future transactions and fills in uncategorized matches.",
    duration: 10_000,
    action: {
      label: "Create rule",
      onClick: async () => {
        const res = await createRuleFromSuggestion({ pattern: suggestion.pattern, categoryId: suggestion.categoryId });
        if (res.ok)
          toast.success(
            res.data.applied ? `Rule created · ${res.data.applied} more transactions categorized` : "Rule created",
          );
        else toast.error(res.error);
      },
    },
  });
}

export function transferLabel(
  row: Pick<TxListRow, "direction" | "linkedCardId">,
  cards: { id: number; name: string }[],
): string {
  const other = cards.find((c) => c.id === row.linkedCardId)?.name;
  if (!other) return row.direction === "out" ? "Transfer out" : "Transfer in";
  return row.direction === "out" ? `To ${other}` : `From ${other}`;
}

export function CategoryCell({ row, onOpenDetail }: { row: TxListRow; onOpenDetail: () => void }) {
  const { categories, cards } = useAppData();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const category = categories.find((c) => c.id === row.categoryId);

  if (row.type === "transfer") {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 text-sm text-transfer">
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-muted">
          <ArrowLeftRight className="size-3" />
        </span>
        <span className="truncate">{transferLabel(row, cards)}</span>
      </span>
    );
  }
  if (row.splitCount > 0) {
    return (
      <button type="button" onClick={onOpenDetail} className="rounded-md hover:opacity-80">
        <SplitBadge count={row.splitCount} />
      </button>
    );
  }

  function select(categoryId: number | null) {
    setOpen(false);
    if (categoryId === row.categoryId) return;
    startTransition(async () => {
      const res = await updateTransaction({ id: row.id, patch: { categoryId } });
      if (!res.ok) return void toast.error(res.error);
      offerRule(res.data.suggestion);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/cat -mx-1.5 inline-flex max-w-full items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Change category"
        >
          <CategoryBadge category={category} />
          <ChevronDown className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cat:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <CategoryCommandList
          categories={categories}
          value={row.categoryId}
          onSelect={select}
          kinds={[row.type === "expense" ? "expense" : "income"]}
          allowNone
        />
      </PopoverContent>
    </Popover>
  );
}

export function NoteTagsEditor({ row, className }: { row: TxListRow; className?: string }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(row.tags);
  const [note, setNote] = useState(row.note ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateTransaction({ id: row.id, patch: { tags, note: note.trim() || null } });
      if (res.ok) setOpen(false);
      else toast.error(res.error);
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTags(row.tags);
          setNote(row.note ?? "");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Edit note and tags"
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            row.note ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100",
            className,
          )}
        >
          <NotebookPen className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-3" align="start">
        <TagInput value={tags} onChange={setTags} prefix="#" placeholder="Add tags" />
        <Textarea dir="auto" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
