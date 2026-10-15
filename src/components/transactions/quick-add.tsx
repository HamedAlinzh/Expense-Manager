"use client";

import { ArrowLeftRight, ChevronDown, LoaderCircle, Minus, Plus, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, use, useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { createTransaction } from "@/app/(app)/transactions/actions";
import { useAppData } from "@/components/app-data";
import { CategorySelect } from "@/components/categories/category-select";
import { AmountInput, inputStringToRial } from "@/components/form/amount-input";
import { DatePicker } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { TagInput } from "@/components/form/tag-input";
import { useMoneyFormatter } from "@/components/prefs/display";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { dayKeyOf, tehranParts } from "@/lib/format/time";
import type { TxType } from "@/lib/schemas/transaction";
import { CardPicker } from "./card-picker";
import { TimeInput } from "./time-input";

const QuickAddContext = createContext<{ open: (type?: TxType) => void }>({ open: () => {} });

export function useQuickAdd() {
  return use(QuickAddContext);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.getAttribute("role") === "combobox"
  );
}

/** Mounts the quick-add dialog once and binds the global "N" shortcut. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; type: TxType; key: number }>({
    open: false,
    type: "expense",
    key: 0,
  });
  const open = useCallback((type: TxType = "expense") => setState((s) => ({ open: true, type, key: s.key + 1 })), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <QuickAddContext value={{ open }}>
      {children}
      <QuickAddDialog
        key={state.key}
        open={state.open}
        initialType={state.type}
        onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
      />
    </QuickAddContext>
  );
}

const TYPES: { value: TxType; label: string; icon: typeof Minus }[] = [
  { value: "expense", label: "Expense", icon: Minus },
  { value: "income", label: "Income", icon: Plus },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { value: "refund", label: "Refund", icon: Undo2 },
];

function nowTime(): string {
  const p = tehranParts(new Date());
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function QuickAddDialog({
  open,
  onOpenChange,
  initialType,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialType: TxType;
}) {
  const { cards, categories, defaultCardId } = useAppData();
  const { unit } = usePrefs();
  const fmt = useMoneyFormatter();
  const router = useRouter();
  const activeCards = cards.filter((c) => !c.archived);
  const fallbackCard = defaultCardId ?? activeCards[0]?.id ?? null;

  const [type, setType] = useState<TxType>(initialType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cardId, setCardId] = useState<number | null>(fallbackCard);
  const [toCardId, setToCardId] = useState<number | null>(activeCards.find((c) => c.id !== fallbackCard)?.id ?? null);
  const [date, setDate] = useState(() => dayKeyOf(new Date()));
  const [time, setTime] = useState(nowTime);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const kind = type === "expense" ? "expense" : "income";
  const isTransfer = type === "transfer";

  function changeType(t: TxType) {
    setType(t);
    const newKind = t === "expense" ? "expense" : "income";
    if (categoryId !== null && categories.find((c) => c.id === categoryId)?.kind !== newKind) setCategoryId(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountRial = inputStringToRial(amount, unit);
    if (!amountRial) {
      setErrors({ amountRial: "Enter an amount greater than zero" });
      return;
    }
    const common = { amountRial, date, time, description, tags, note: note.trim() || null };
    const payload = isTransfer
      ? { ...common, type: "transfer" as const, fromCardId: cardId ?? 0, toCardId: toCardId ?? 0 }
      : { ...common, type, cardId, categoryId, merchant: null };
    startTransition(async () => {
      const res = await createTransaction(payload);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      const cat = categories.find((c) => c.id === res.data.categoryId);
      const card = cards.find((c) => c.id === cardId);
      toast.success(`${TYPES.find((t) => t.value === type)!.label} of ${fmt(amountRial)} added`, {
        description: [card?.name, res.data.autoCategorized && cat ? `auto-categorized as ${cat.name}` : cat?.name]
          .filter(Boolean)
          .join(" · "),
        action: { label: "View", onClick: () => router.push("/transactions") },
      });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] gap-5 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
          <DialogDescription className="hidden sm:block">
            Press <Kbd>N</Kbd> anywhere to open this. <Kbd>Enter</Kbd> saves.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1" role="radiogroup" aria-label="Type">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const selected = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => changeType(t.value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-sm",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    selected && t.value === "expense" && "text-expense",
                    selected && (t.value === "income" || t.value === "refund") && "text-income",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <Field label="Amount" htmlFor="qa-amount" error={errors.amountRial}>
            <AmountInput id="qa-amount" size="lg" value={amount} onChange={setAmount} autoFocus />
          </Field>

          <Field label="Description" htmlFor="qa-desc" error={errors.description}>
            <Input
              id="qa-desc"
              dir="auto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isTransfer ? "Optional" : "e.g. Lunch, سوپرمارکت"}
            />
          </Field>

          {isTransfer ? (
            <>
              <Field label="From card" error={errors.fromCardId}>
                <CardPicker cards={cards} value={cardId} onChange={setCardId} label="From card" />
              </Field>
              <Field label="To card" error={errors.toCardId}>
                <CardPicker
                  cards={cards.filter((c) => c.id !== cardId)}
                  value={toCardId}
                  onChange={setToCardId}
                  label="To card"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Card" error={errors.cardId}>
                <CardPicker cards={cards} value={cardId} onChange={setCardId} allowNone />
              </Field>
              <Field label="Category" hint="Leave empty to let your rules decide." error={errors.categoryId}>
                <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} kinds={[kind]} />
              </Field>
            </>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Date" error={errors.date}>
              <DatePicker value={date} onChange={setDate} className="w-full" />
            </Field>
            <Field label="Time" htmlFor="qa-time" error={errors.time}>
              <TimeInput id="qa-time" value={time} onChange={setTime} />
            </Field>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" /> Tags & note
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 flex flex-col gap-3">
              <Field label="Tags">
                <TagInput value={tags} onChange={setTags} prefix="#" placeholder="trip, work…" />
              </Field>
              <Field label="Note" htmlFor="qa-note">
                <Textarea id="qa-note" dir="auto" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </CollapsibleContent>
          </Collapsible>

          <Button type="submit" size="lg" className="h-11 rounded-xl" disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" />}
            Add {TYPES.find((t) => t.value === type)!.label.toLowerCase()}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Button that opens quick add; used in page headers. */
export function QuickAddButton({ className, children }: { className?: string; children?: ReactNode }) {
  const { open } = useQuickAdd();
  return (
    <Button className={className} onClick={() => open()}>
      <Plus /> {children ?? "Add"}
      <Kbd className="ml-1 hidden bg-primary-foreground/15 text-primary-foreground sm:inline-flex">N</Kbd>
    </Button>
  );
}
