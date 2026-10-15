"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCategory } from "@/app/(app)/categories/actions";
import { Field } from "@/components/form/field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CategoryLite } from "./category-badge";
import { CategorySelect } from "./category-select";

export function DeleteCategoryDialog({
  category,
  usage,
  categories,
  onClose,
}: {
  category: CategoryLite | null;
  usage: number;
  categories: CategoryLite[];
  onClose: () => void;
}) {
  const [reassignTo, setReassignTo] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  if (!category) return null;
  const options = categories.filter((c) => c.kind === category.kind && c.id !== category.id);

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{category.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {usage > 0
              ? `${usage} transaction${usage === 1 ? "" : "s"} use this category. Move them to another category or leave them uncategorized. Its budget is removed.`
              : "No transactions use this category. Its budget, if any, is removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {usage > 0 && (
          <Field label="Move transactions and rules to">
            <CategorySelect categories={options} value={reassignTo} onChange={setReassignTo} kinds={[category.kind]} />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteCategory({ id: category.id, reassignTo });
                if (res.ok) {
                  toast.success("Category deleted");
                  onClose();
                } else toast.error(res.error);
              })
            }
          >
            {pending && <LoaderCircle className="animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
