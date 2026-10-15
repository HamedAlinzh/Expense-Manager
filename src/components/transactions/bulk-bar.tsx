"use client";

import { CheckCheck, Hash, Tags, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkUpdate } from "@/app/(app)/transactions/actions";
import { useAppData } from "@/components/app-data";
import { CategoryCommandList } from "@/components/categories/category-select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { TagInput } from "@/components/form/tag-input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BulkAction } from "@/lib/schemas/transaction";

export function BulkBar({ ids, onDone, onClear }: { ids: number[]; onDone: () => void; onClear: () => void }) {
  const { categories } = useAppData();
  const [catOpen, setCatOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: BulkAction, verb: string) {
    startTransition(async () => {
      const res = await bulkUpdate({ ids, action });
      if (!res.ok) return void toast.error(res.error);
      const { updated, skipped } = res.data;
      toast.success(`${verb} ${updated} transaction${updated === 1 ? "" : "s"}`, {
        description: skipped ? `${skipped} skipped (transfers or a different category kind)` : undefined,
      });
      onDone();
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 animate-in fade-in slide-in-from-bottom-4 lg:bottom-6 lg:pl-64">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-popover/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <span className="amount px-2.5 text-sm font-medium whitespace-nowrap">{ids.length} selected</span>
        <Popover open={catOpen} onOpenChange={setCatOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <Tags /> <span className="hidden sm:inline">Categorize</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" side="top">
            <CategoryCommandList
              categories={categories}
              value={-1}
              allowNone
              onSelect={(categoryId) => {
                setCatOpen(false);
                run({ kind: "category", categoryId }, "Categorized");
              }}
            />
          </PopoverContent>
        </Popover>
        <Popover open={tagOpen} onOpenChange={setTagOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <Hash /> <span className="hidden sm:inline">Tags</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-72 flex-col gap-2" side="top">
            <TagInput value={tags} onChange={setTags} prefix="#" placeholder="Tags to add or remove" />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!tags.length}
                onClick={() => {
                  setTagOpen(false);
                  run({ kind: "removeTags", tags }, "Untagged");
                }}
              >
                Remove
              </Button>
              <Button
                size="sm"
                disabled={!tags.length}
                onClick={() => {
                  setTagOpen(false);
                  run({ kind: "addTags", tags }, "Tagged");
                }}
              >
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run({ kind: "confirm" }, "Confirmed")}>
          <CheckCheck /> <span className="hidden sm:inline">Confirm</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 /> <span className="hidden sm:inline">Delete</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
          <X />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}?`}
        description="This can't be undone. The other half of any selected transfer is deleted too."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          setConfirmDelete(false);
          run({ kind: "delete" }, "Deleted");
        }}
      />
    </div>
  );
}
