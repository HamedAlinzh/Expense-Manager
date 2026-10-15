"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCategory, updateCategory } from "@/app/(app)/categories/actions";
import { ColorPicker } from "@/components/form/color-picker";
import { Field } from "@/components/form/field";
import { IconPicker } from "@/components/form/icon-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryDot, type CategoryLite } from "./category-badge";

const NO_PARENT = "none";

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  categories,
  defaultKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryLite | null;
  categories: CategoryLite[];
  defaultKind: "expense" | "income";
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<"expense" | "income">(category?.kind ?? defaultKind);
  const [icon, setIcon] = useState(category?.icon ?? "circle");
  const [color, setColor] = useState(category?.color ?? "#a78bfa");
  const [parentId, setParentId] = useState<number | null>(category?.parentId ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const hasChildren = category ? categories.some((c) => c.parentId === category.id) : false;
  const parentOptions = categories.filter(
    (c) => c.kind === kind && c.parentId === null && c.id !== category?.id && !c.archived,
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = { name, kind, icon, color, parentId: parentOptions.some((p) => p.id === parentId) ? parentId : null };
    startTransition(async () => {
      const res = category ? await updateCategory({ id: category.id, data }) : await createCategory(data);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(category ? "Category updated" : "Category created");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>Icons and colors appear in lists, charts and the bot.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <CategoryDot category={{ icon, color }} size="lg" />
            <Field label="Name" htmlFor="cat-name" error={errors.name} className="flex-1">
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} dir="auto" autoFocus />
            </Field>
          </div>
          <Field label="Kind">
            <ToggleGroup
              type="single"
              variant="outline"
              value={kind}
              onValueChange={(v) => v && setKind(v as typeof kind)}
              className="w-full"
            >
              <ToggleGroupItem value="expense" className="flex-1">
                Expense
              </ToggleGroupItem>
              <ToggleGroupItem value="income" className="flex-1">
                Income
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {!hasChildren && (
            <Field label="Parent" hint="Optional — makes this a subcategory.">
              <Select
                value={parentId?.toString() ?? NO_PARENT}
                onValueChange={(v) => setParentId(v === NO_PARENT ? null : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>None (top level)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Icon" error={errors.icon}>
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </Field>
          <Field label="Color" error={errors.color}>
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {category ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
