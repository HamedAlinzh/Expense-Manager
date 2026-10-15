"use client";

import { FlaskConical, LoaderCircle, WandSparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  applyRuleToExisting,
  createRule,
  previewRule,
  type RulePreviewItem,
  updateRule,
} from "@/app/(app)/categories/actions";
import { Field } from "@/components/form/field";
import { DateTime, Money } from "@/components/prefs/display";
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
import { Switch } from "@/components/ui/switch";
import { hasPersian } from "@/lib/format/text";
import type { RuleRow } from "@/server/queries/categories";
import { RULE_FIELD_LABELS, RULE_MATCH_LABELS, type RuleInput } from "@/lib/schemas/category";
import { CategoryBadge, type CategoryLite } from "./category-badge";
import { CategorySelect } from "./category-select";

const KEEP_TYPE = "keep";

type Preview = { total: number; changing: number; scanned: number; items: RulePreviewItem[] };

export function RuleFormDialog({
  open,
  onOpenChange,
  rule,
  categories,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RuleRow | null;
  categories: CategoryLite[];
  /** Prefill for "Always categorize X as Y" shortcuts. */
  initial?: Partial<RuleInput>;
}) {
  const [form, setForm] = useState<RuleInput>({
    matchField: rule?.matchField ?? initial?.matchField ?? "merchant",
    matchType: rule?.matchType ?? initial?.matchType ?? "contains",
    pattern: rule?.pattern ?? initial?.pattern ?? "",
    categoryId: rule?.categoryId ?? initial?.categoryId ?? categories[0]?.id ?? 0,
    setType: rule?.setType ?? initial?.setType ?? null,
    priority: rule?.priority ?? initial?.priority ?? 100,
    enabled: rule?.enabled ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewing, startPreview] = useTransition();
  const set = <K extends keyof RuleInput>(k: K, v: RuleInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPreview(null);
  };
  const byId = new Map(categories.map((c) => [c.id, c]));

  function runPreview() {
    startPreview(async () => {
      const res = await previewRule(form);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return;
      }
      setErrors({});
      setPreview(res.data);
    });
  }

  function save(applyExisting: boolean) {
    startTransition(async () => {
      const res = rule ? await updateRule({ id: rule.id, data: form }) : await createRule(form);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      if (applyExisting) {
        const applied = await applyRuleToExisting(form);
        if (applied.ok) toast.success(`Rule saved · ${applied.data.updated} transactions re-categorized`);
        else toast.error(applied.error);
      } else {
        toast.success("Rule saved");
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>
            Rules run in priority order (lowest first); the first match sets the category.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="When">
              <Select value={form.matchField} onValueChange={(v) => set("matchField", v as RuleInput["matchField"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_FIELD_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Match">
              <Select value={form.matchType} onValueChange={(v) => set("matchType", v as RuleInput["matchType"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_MATCH_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="Pattern"
            htmlFor="rule-pattern"
            error={errors.pattern}
            hint={
              form.matchField === "merchant"
                ? "Merchant rules also check the description when no merchant was detected."
                : "Case, Persian/Arabic letter forms and digits are normalized."
            }
          >
            <Input
              id="rule-pattern"
              value={form.pattern}
              onChange={(e) => set("pattern", e.target.value)}
              dir="auto"
              autoFocus
              className={form.matchType === "regex" && !hasPersian(form.pattern) ? "font-mono" : undefined}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" className="col-span-2 sm:col-span-1" error={errors.categoryId}>
              <CategorySelect
                categories={categories}
                value={form.categoryId}
                onChange={(v) => v !== null && set("categoryId", v)}
                allowNone={false}
              />
            </Field>
            <Field label="Also set type" className="col-span-2 sm:col-span-1">
              <Select
                value={form.setType ?? KEEP_TYPE}
                onValueChange={(v) => set("setType", v === KEEP_TYPE ? null : (v as RuleInput["setType"]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP_TYPE}>Keep detected type</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-end gap-6">
            <Field label="Priority" htmlFor="rule-priority" hint="Lower runs first." error={errors.priority}>
              <Input
                id="rule-priority"
                type="number"
                min={0}
                className="w-28"
                value={form.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
              />
            </Field>
            <label className="flex items-center gap-2 pb-6 text-sm">
              <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} /> Enabled
            </label>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Test against existing transactions</p>
              <Button type="button" variant="secondary" size="sm" onClick={runPreview} disabled={previewing}>
                {previewing ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Run test
              </Button>
            </div>
            {preview && (
              <div className="mt-3 animate-in fade-in">
                <p className="text-xs text-muted-foreground">
                  Matches <strong className="text-foreground">{preview.total}</strong> of the latest {preview.scanned}{" "}
                  transactions
                  {preview.total > 0 && <> · {preview.changing} would change category</>}.
                </p>
                {preview.items.length > 0 && (
                  <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                    {preview.items.map((it) => (
                      <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <DateTime date={it.occurredAt} className="text-xs text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate" dir="auto">
                          {it.merchant || it.description || "—"}
                        </span>
                        <CategoryBadge
                          category={it.categoryId ? byId.get(it.categoryId) : null}
                          className="hidden max-w-32 sm:inline-flex"
                        />
                        <Money rial={it.amountRial} kind={it.type} direction={it.direction} className="text-xs" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => save(true)}>
              <WandSparkles /> Save &amp; apply to existing
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              Save rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
