"use client";

import { ArrowLeftRight, CheckCheck, LoaderCircle, MessageSquareText, Plus, Split, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  deleteTransaction,
  fetchTransactionDetail,
  setSplits,
  updateTransaction,
} from "@/app/(app)/transactions/actions";
import { useAppData } from "@/components/app-data";
import { CategorySelect } from "@/components/categories/category-select";
import { RawMessage } from "@/components/common/bidi-text";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { AmountInput, inputStringToRial, rialToInputString } from "@/components/form/amount-input";
import { DatePicker } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { TagInput } from "@/components/form/tag-input";
import { DateTime, Money, useMoneyFormatter } from "@/components/prefs/display";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayKeyOf, tehranParts, timeAgo } from "@/lib/format/time";
import { SOURCE_LABELS, TYPE_LABELS } from "@/lib/schemas/transaction";
import type { TransactionDetail } from "@/server/queries/transactions";
import { CardPicker } from "./card-picker";
import { TimeInput } from "./time-input";
import { offerRule } from "./tx-inline";
import { SOURCE_ICONS, StatusPill } from "./tx-meta";

export function TxDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState<{ key: string; detail?: TransactionDetail; error?: string } | null>(null);
  const [version, setVersion] = useState(0);
  const requestKey = `${id}:${version}`;

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    fetchTransactionDetail({ id }).then((res) => {
      if (!cancelled)
        setLoaded(
          res.ok ? { key: `${id}:${version}`, detail: res.data } : { key: `${id}:${version}`, error: res.error },
        );
    });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  // Keep showing the previous detail for the same transaction while a reload is in flight.
  const fresh = loaded?.key === requestKey ? loaded : null;
  const current = (fresh?.detail ?? (loaded?.detail?.tx.id === id ? loaded.detail : null)) || null;
  const loadError = fresh?.error ?? null;

  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {current ? (
          <DrawerBody
            key={`${current.tx.id}-${current.tx.updatedAt.toString()}`}
            detail={current}
            onClose={onClose}
            onReload={() => setVersion((v) => v + 1)}
          />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">Transaction</SheetTitle>
              <SheetDescription className="sr-only">Loading transaction</SheetDescription>
            </SheetHeader>
            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : (
              <>
                <Skeleton className="h-10 w-40 rounded-lg" />
                <Skeleton className="h-4 w-56 rounded" />
                <Skeleton className="mt-4 h-64 rounded-2xl" />
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function hhmm(d: Date) {
  const p = tehranParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function DrawerBody({
  detail,
  onClose,
  onReload,
}: {
  detail: TransactionDetail;
  onClose: () => void;
  onReload: () => void;
}) {
  const { tx, raw, splits, linked } = detail;
  const { cards, categories } = useAppData();
  const { unit } = usePrefs();
  const isTransfer = tx.type === "transfer";
  const occurred = new Date(tx.occurredAt);

  const [type, setType] = useState(tx.type);
  const [amount, setAmount] = useState(rialToInputString(tx.amountRial, unit));
  const [description, setDescription] = useState(tx.description);
  const [merchant, setMerchant] = useState(tx.merchant ?? "");
  const [cardId, setCardId] = useState(tx.cardId);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [date, setDate] = useState(dayKeyOf(occurred));
  const [time, setTime] = useState(hhmm(occurred));
  const [tags, setTags] = useState(tx.tags);
  const [note, setNote] = useState(tx.note ?? "");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const kind = type === "expense" ? "expense" : "income";
  const SourceIcon = SOURCE_ICONS[tx.source];

  function save(extra?: { status: "confirmed" }) {
    const amountRial = inputStringToRial(amount, unit);
    if (!amountRial) return void toast.error("Enter a valid amount");
    const patch: Parameters<typeof updateTransaction>[0]["patch"] = {};
    if (!isTransfer && type !== tx.type) patch.type = type as "expense" | "income" | "refund";
    if (amountRial !== tx.amountRial) patch.amountRial = amountRial;
    if (description !== tx.description) patch.description = description;
    if ((merchant.trim() || null) !== tx.merchant) patch.merchant = merchant.trim() || null;
    if (cardId !== tx.cardId) patch.cardId = cardId;
    if (!isTransfer && categoryId !== tx.categoryId) patch.categoryId = categoryId;
    if (date !== dayKeyOf(occurred) || time !== hhmm(occurred)) Object.assign(patch, { date, time });
    if (JSON.stringify(tags) !== JSON.stringify(tx.tags)) patch.tags = tags;
    if ((note.trim() || null) !== tx.note) patch.note = note.trim() || null;
    if (extra) Object.assign(patch, extra);
    if (Object.keys(patch).length === 0) return void onClose();

    startTransition(async () => {
      const res = await updateTransaction({ id: tx.id, patch });
      if (!res.ok) return void toast.error(res.error);
      toast.success(extra ? "Confirmed" : "Saved");
      if (res.data.splitsCleared) toast.info("Splits were removed because the amount changed.");
      offerRule(res.data.suggestion);
      onClose();
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-3 border-b border-border p-6 pb-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceIcon className="size-3.5" />
          {SOURCE_LABELS[tx.source]} · {TYPE_LABELS[tx.type]}
          <StatusPill status={tx.status} />
        </div>
        <SheetTitle className="text-3xl font-semibold tracking-tight">
          <Money rial={tx.amountRial} kind={tx.type} direction={tx.direction} />
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 text-sm">
          <span dir="auto" className="text-foreground">
            {tx.merchant || tx.description || "Untitled"}
          </span>
          <DateTime date={tx.occurredAt} time />
        </SheetDescription>
        {tx.status === "pending_review" && (
          <Button
            className="mt-1 self-start"
            size="sm"
            onClick={() => save({ status: "confirmed" })}
            disabled={pending}
          >
            <CheckCheck /> Looks right — confirm
          </Button>
        )}
      </SheetHeader>

      <form
        className="flex flex-1 flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {!isTransfer && (
          <Field label="Type">
            <ToggleGroup
              type="single"
              variant="outline"
              value={type}
              onValueChange={(v) => v && setType(v as typeof type)}
              className="w-full"
            >
              <ToggleGroupItem value="expense" className="flex-1">
                Expense
              </ToggleGroupItem>
              <ToggleGroupItem value="income" className="flex-1">
                Income
              </ToggleGroupItem>
              <ToggleGroupItem value="refund" className="flex-1">
                Refund
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        )}
        <Field label="Amount" hint={isTransfer ? "Updates both sides of the transfer." : undefined}>
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Description">
          <Input dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {!isTransfer && (
          <Field label="Merchant" hint="Cleaned-up name used by rules and reports.">
            <Input dir="auto" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="—" />
          </Field>
        )}
        <Field label="Card">
          <CardPicker cards={cards} value={cardId} onChange={setCardId} allowNone={!isTransfer} />
        </Field>
        {!isTransfer && splits.length === 0 && (
          <Field label="Category">
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} kinds={[kind]} />
          </Field>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} className="w-full" />
          </Field>
          <Field label="Time">
            <TimeInput value={time} onChange={setTime} />
          </Field>
        </div>
        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} prefix="#" placeholder="Add tags" />
        </Field>
        <Field label="Note">
          <Textarea dir="auto" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" />}
            Save changes
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete transaction"
          >
            <Trash2 />
          </Button>
        </div>

        {!isTransfer && (
          <SplitsEditor txId={tx.id} amountRial={tx.amountRial} kind={kind} initial={splits} onSaved={onReload} />
        )}

        {linked && (
          <section className="rounded-2xl border border-border p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <ArrowLeftRight className="size-4 text-muted-foreground" />{" "}
              {isTransfer ? "Other side of this transfer" : "Linked transaction"}
            </h3>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground" dir="auto">
                {linked.cardName ?? "No card"} · <DateTime date={linked.occurredAt} time />
              </span>
              <Money rial={linked.amountRial} kind={linked.type} direction={linked.direction} />
            </div>
          </section>
        )}

        {raw && (
          <section className="rounded-2xl border border-border bg-muted/20 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <MessageSquareText className="size-4 text-muted-foreground" /> Original message
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              From <span dir="ltr">{raw.sender}</span> · <DateTime date={raw.receivedAt} time seconds />
              {raw.parserUsed && <> · parsed by {raw.parserUsed}</>}
            </p>
            {raw.body ? (
              <RawMessage body={raw.body} className="text-sm" />
            ) : (
              <p className="text-sm text-muted-foreground italic">Message body was not stored.</p>
            )}
          </section>
        )}

        <p className="mt-auto pt-4 text-xs text-muted-foreground">
          #{tx.id} · created {timeAgo(new Date(tx.createdAt))}
          {tx.updatedAt.toString() !== tx.createdAt.toString() && <> · edited {timeAgo(new Date(tx.updatedAt))}</>}
          {tx.confidence !== null && <> · parser confidence {Math.round(tx.confidence * 100)}%</>}
          {tx.balanceAfterRial !== null && (
            <>
              {" "}
              · balance after <Money rial={tx.balanceAfterRial} colored={false} />
            </>
          )}
        </p>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this transaction?"
        description={isTransfer ? "Both sides of the transfer will be deleted." : "This can't be undone."}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteTransaction({ id: tx.id });
          if (res.ok) {
            toast.success("Transaction deleted");
            setConfirmDelete(false);
            onClose();
          } else toast.error(res.error);
        }}
      />
    </div>
  );
}

type SplitDraft = { key: number; categoryId: number | null; amount: string; note: string };

function SplitsEditor({
  txId,
  amountRial,
  kind,
  initial,
  onSaved,
}: {
  txId: number;
  amountRial: number;
  kind: "expense" | "income";
  initial: TransactionDetail["splits"];
  onSaved: () => void;
}) {
  const { categories } = useAppData();
  const { unit } = usePrefs();
  const fmt = useMoneyFormatter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<SplitDraft[]>([]);
  const [pending, startTransition] = useTransition();

  function start() {
    setRows(
      initial.length
        ? initial.map((s, i) => ({
            key: i,
            categoryId: s.categoryId,
            amount: rialToInputString(s.amountRial, unit),
            note: s.note ?? "",
          }))
        : [
            { key: 0, categoryId: null, amount: rialToInputString(amountRial, unit), note: "" },
            { key: 1, categoryId: null, amount: "", note: "" },
          ],
    );
    setEditing(true);
  }

  const parsed = rows.map((r) => inputStringToRial(r.amount, unit) ?? 0);
  const allocated = parsed.reduce((a, b) => a + b, 0);
  const remaining = amountRial - allocated;

  function save(clear = false) {
    const splits = clear
      ? []
      : rows.map((r, i) => ({ categoryId: r.categoryId, amountRial: parsed[i]!, note: r.note.trim() || null }));
    startTransition(async () => {
      const res = await setSplits({ id: txId, splits });
      if (!res.ok) return void toast.error(res.error);
      toast.success(clear ? "Split removed" : "Split saved");
      setEditing(false);
      onSaved();
    });
  }

  if (!editing) {
    return (
      <section className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Split className="size-4 text-muted-foreground" /> Split
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={start}>
            {initial.length ? "Edit split" : "Split across categories"}
          </Button>
        </div>
        {initial.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {initial.map((s) => {
              const c = categories.find((x) => x.id === s.categoryId);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="truncate" dir="auto">
                    {c?.name ?? "Uncategorized"}
                    {s.note && <span className="text-muted-foreground"> · {s.note}</span>}
                  </span>
                  <Money rial={s.amountRial} colored={false} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Split className="size-4 text-primary" /> Split {fmt(amountRial)}
      </h3>
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-[1fr_8.5rem_auto] items-center gap-2">
          <CategorySelect
            categories={categories}
            value={r.categoryId}
            onChange={(v) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, categoryId: v } : x)))}
            kinds={[kind]}
          />
          <AmountInput
            value={r.amount}
            onChange={(v) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: v } : x)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={rows.length <= 2}
            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            aria-label={`Remove part ${i + 1}`}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              {
                key: Math.max(...rs.map((x) => x.key)) + 1,
                categoryId: null,
                amount: remaining > 0 ? rialToInputString(remaining, unit) : "",
                note: "",
              },
            ])
          }
        >
          <Plus /> Add part
        </Button>
        <span className={cn("amount text-xs", remaining === 0 ? "text-income" : "text-amber-300")}>
          {remaining === 0 ? "Fully allocated" : `${fmt(Math.abs(remaining))} ${remaining > 0 ? "left" : "over"}`}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        {initial.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => save(true)} disabled={pending}>
            Remove split
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => save()}
          disabled={pending || remaining !== 0 || parsed.some((p) => p <= 0)}
        >
          {pending && <LoaderCircle className="animate-spin" />}
          Save split
        </Button>
      </div>
    </section>
  );
}
