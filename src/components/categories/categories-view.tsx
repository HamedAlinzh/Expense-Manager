"use client";

import { Archive, ArchiveRestore, ArrowRight, EllipsisVertical, Pencil, Plus, Tags, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRule, setCategoryArchived, setRuleEnabled } from "@/app/(app)/categories/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CategoryWithUsage, RuleRow } from "@/server/queries/categories";
import { hasPersian } from "@/lib/format/text";
import { RULE_FIELD_LABELS, RULE_MATCH_LABELS } from "@/lib/schemas/category";
import { CategoryBadge, CategoryDot } from "./category-badge";
import { CategoryFormDialog } from "./category-form-dialog";
import { sortCategoryTree } from "./category-select";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { RuleFormDialog } from "./rule-form-dialog";

type Tab = "expense" | "income" | "rules";

export function CategoriesView({ categories, rules }: { categories: CategoryWithUsage[]; rules: RuleRow[] }) {
  const [tab, setTab] = useState<Tab>("expense");
  const [catDialog, setCatDialog] = useState<{ open: boolean; category: CategoryWithUsage | null; key: number }>({
    open: false,
    category: null,
    key: 0,
  });
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: RuleRow | null; key: number }>({
    open: false,
    rule: null,
    key: 0,
  });
  const [toDelete, setToDelete] = useState<CategoryWithUsage | null>(null);
  const [, startTransition] = useTransition();
  const byId = new Map(categories.map((c) => [c.id, c]));

  const openCategory = (category: CategoryWithUsage | null) =>
    setCatDialog((s) => ({ open: true, category, key: s.key + 1 }));
  const openRule = (rule: RuleRow | null) => setRuleDialog((s) => ({ open: true, rule, key: s.key + 1 }));

  function run(p: Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const res = await p;
      if (res.ok) {
        if (success) toast.success(success);
      } else toast.error(res.error);
    });
  }

  return (
    <>
      <PageHeader
        title="Categories & Rules"
        subtitle="Organise spending and automate categorisation"
        actions={
          tab === "rules" ? (
            <Button onClick={() => openRule(null)}>
              <Plus /> New rule
            </Button>
          ) : (
            <Button onClick={() => openCategory(null)}>
              <Plus /> New category
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-5">
          <TabsTrigger value="expense">Expense</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="rules">
            Rules{" "}
            <Badge variant="secondary" className="ml-1">
              {rules.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {(["expense", "income"] as const).map((kind) => {
          const list = sortCategoryTree(categories.filter((c) => c.kind === kind));
          return (
            <TabsContent key={kind} value={kind}>
              {list.length === 0 ? (
                <EmptyState
                  icon={Tags}
                  title={`No ${kind} categories`}
                  action={<Button onClick={() => openCategory(null)}>Create one</Button>}
                />
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {list.map((c) => (
                    <li
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-3 ${c.depth ? "pl-12" : ""} ${c.archived ? "opacity-50" : ""}`}
                    >
                      <CategoryDot category={c} size={c.depth ? "sm" : "md"} />
                      <button
                        type="button"
                        onClick={() => openCategory(c)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                        dir="auto"
                      >
                        {c.name}
                      </button>
                      {c.archived && <Badge variant="outline">Archived</Badge>}
                      <Link
                        href={`/transactions?category=${c.id}`}
                        className="amount text-xs text-muted-foreground hover:text-foreground"
                      >
                        {c.txCount} txns
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`${c.name} actions`}>
                            <EllipsisVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openCategory(c)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              run(
                                setCategoryArchived({ id: c.id, archived: !c.archived }),
                                c.archived ? "Restored" : "Archived — hidden from pickers",
                              )
                            }
                          >
                            {c.archived ? <ArchiveRestore /> : <Archive />} {c.archived ? "Restore" : "Archive"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(c)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          );
        })}

        <TabsContent value="rules">
          {rules.length === 0 ? (
            <EmptyState
              icon={Wand2}
              title="No rules yet"
              body="Rules categorize incoming transactions automatically."
              action={<Button onClick={() => openRule(null)}>Create a rule</Button>}
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${r.enabled ? "" : "opacity-50"}`}
                >
                  <span className="amount w-10 text-xs text-muted-foreground" title="Priority">
                    #{r.priority}
                  </span>
                  <button
                    type="button"
                    onClick={() => openRule(r)}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left text-sm"
                  >
                    <span className="text-muted-foreground">{RULE_FIELD_LABELS[r.matchField]}</span>
                    <span className="text-muted-foreground">{RULE_MATCH_LABELS[r.matchType]}</span>
                    <code
                      className={`rounded-md bg-muted px-1.5 py-0.5 text-[0.8rem] ${r.matchType === "regex" && !hasPersian(r.pattern) ? "font-mono" : "font-sans"}`}
                      dir="auto"
                    >
                      {r.pattern}
                    </code>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                    <CategoryBadge category={byId.get(r.categoryId)} />
                    {r.setType && <Badge variant="outline">as {r.setType}</Badge>}
                  </button>
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => run(setRuleEnabled({ id: r.id, enabled: v }))}
                    aria-label="Enabled"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete rule"
                    onClick={() => run(deleteRule({ id: r.id }), "Rule deleted")}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        key={`c${catDialog.key}`}
        open={catDialog.open}
        onOpenChange={(open) => setCatDialog((s) => ({ ...s, open }))}
        category={catDialog.category}
        categories={categories}
        defaultKind={tab === "income" ? "income" : "expense"}
      />
      <RuleFormDialog
        key={`r${ruleDialog.key}`}
        open={ruleDialog.open}
        onOpenChange={(open) => setRuleDialog((s) => ({ ...s, open }))}
        rule={ruleDialog.rule}
        categories={categories}
      />
      <DeleteCategoryDialog
        key={toDelete?.id}
        category={toDelete}
        usage={toDelete?.txCount ?? 0}
        categories={categories}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
