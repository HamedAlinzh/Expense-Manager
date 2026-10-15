"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createFromMessage } from "@/app/(app)/inbox/actions";
import { useAppData } from "@/components/app-data";
import { RawMessage } from "@/components/common/bidi-text";
import { CategorySelect } from "@/components/categories/category-select";
import { AmountInput, inputStringToRial, rialToInputString } from "@/components/form/amount-input";
import { DatePicker } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { CardPicker } from "@/components/transactions/card-picker";
import { TimeInput } from "@/components/transactions/time-input";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayKeyOf, tehranParts } from "@/lib/format/time";
import type { RawMessageRow } from "@/server/queries/inbox";

type Partial = {
  type?: "expense" | "income" | "refund";
  amountRial?: number;
  occurredAt?: string;
  description?: string;
};

export function CreateFromMessageDialog({ message, onClose }: { message: RawMessageRow; onClose: () => void }) {
  const { cards, categories } = useAppData();
  const { unit } = usePrefs();
  const guess = (message.parseResult ?? {}) as Partial;
  const at = new Date(guess.occurredAt ?? message.receivedAt);
  const p = tehranParts(at);

  const [type, setType] = useState<"expense" | "income" | "refund">(guess.type ?? "expense");
  const [amount, setAmount] = useState(rialToInputString(guess.amountRial, unit));
  const [cardId, setCardId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(dayKeyOf(at));
  const [time, setTime] = useState(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
  const [description, setDescription] = useState(guess.description ?? "");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountRial = inputStringToRial(amount, unit);
    if (!amountRial) return void toast.error("Enter the amount");
    startTransition(async () => {
      const res = await createFromMessage({
        rawId: message.id,
        type,
        amountRial,
        cardId,
        categoryId,
        date,
        time,
        description,
        tags: [],
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Transaction created");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create transaction from message</DialogTitle>
          <DialogDescription>The message stays attached to the transaction.</DialogDescription>
        </DialogHeader>
        <RawMessage
          body={message.body ?? ""}
          className="max-h-40 overflow-y-auto rounded-xl bg-muted/40 px-3 py-2 text-[0.8rem]"
        />
        <form onSubmit={submit} className="flex flex-col gap-4">
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
          <Field label="Amount">
            <AmountInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Card">
            <CardPicker cards={cards} value={cardId} onChange={setCardId} allowNone />
          </Field>
          <Field label="Category">
            <CategorySelect
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              kinds={[type === "expense" ? "expense" : "income"]}
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Date">
              <DatePicker value={date} onChange={setDate} className="w-full" />
            </Field>
            <Field label="Time">
              <TimeInput value={time} onChange={setTime} />
            </Field>
          </div>
          <Field label="Description">
            <Input dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
