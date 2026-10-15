"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { setBudget } from "@/app/(app)/budgets/actions";
import { useAppData } from "@/components/app-data";
import { CategorySelect } from "@/components/categories/category-select";
import { AmountInput, inputStringToRial, rialToInputString } from "@/components/form/amount-input";
import { Field } from "@/components/form/field";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const THRESHOLD_OPTIONS = [50, 80, 90, 100];

export type BudgetDraft = { categoryId: number | null; amountRial: number | null; thresholds: number[] };

export function BudgetDialog({
  open,
  onOpenChange,
  initial,
  month,
  monthLabel,
  budgetedIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: BudgetDraft;
  month: string;
  monthLabel: string;
  budgetedIds: number[];
}) {
  const { categories } = useAppData();
  const { unit } = usePrefs();
  const editing = initial.categoryId !== null;
  const [categoryId, setCategoryId] = useState<number | null>(initial.categoryId);
  const [amount, setAmount] = useState(rialToInputString(initial.amountRial, unit));
  const [thresholds, setThresholds] = useState<number[]>(initial.thresholds);
  const [pending, startTransition] = useTransition();
  const options = categories.filter(
    (c) => c.kind === "expense" && (!budgetedIds.includes(c.id) || c.id === initial.categoryId),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountRial = inputStringToRial(amount, unit);
    if (!categoryId) return void toast.error("Pick a category");
    if (!amountRial) return void toast.error("Enter the monthly limit");
    if (thresholds.length === 0) return void toast.error("Keep at least one alert threshold");
    startTransition(async () => {
      const res = await setBudget({ categoryId, amountRial, thresholds, month });
      if (!res.ok) return void toast.error(res.error);
      toast.success(editing ? "Budget updated" : "Budget added");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit budget" : "New budget"}</DialogTitle>
          <DialogDescription>
            Applies from {monthLabel} onward and carries over each month until you change it. Earlier months keep their
            budgets.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Category" hint="Subcategories count toward their parent's budget.">
            {editing ? (
              <p className="text-sm font-medium">{categories.find((c) => c.id === categoryId)?.name}</p>
            ) : (
              <CategorySelect
                categories={options}
                value={categoryId}
                onChange={setCategoryId}
                kinds={["expense"]}
                allowNone={false}
              />
            )}
          </Field>
          <Field label="Monthly limit">
            <AmountInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Telegram alerts at" hint="You'll get one message per threshold per month.">
            <div className="flex flex-wrap gap-2">
              {THRESHOLD_OPTIONS.map((t) => {
                const on = thresholds.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setThresholds((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t].sort((a, b) => a - b)))
                    }
                    className={cn(
                      "amount rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      on
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}%
                  </button>
                );
              })}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {editing ? "Save" : "Add budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
