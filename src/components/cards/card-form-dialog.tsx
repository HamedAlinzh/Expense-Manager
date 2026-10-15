"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCard, updateCard } from "@/app/(app)/cards/actions";
import { AmountInput, inputStringToRial, rialToInputString } from "@/components/form/amount-input";
import { ColorPicker } from "@/components/form/color-picker";
import { Field } from "@/components/form/field";
import { TagInput } from "@/components/form/tag-input";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Card } from "@/db/schema";
import { BANK_LABELS, type CardInput } from "@/lib/schemas/card";
import { CardVisual } from "./card-visual";

type FormState = {
  name: string;
  bank: CardInput["bank"];
  color: string;
  cardType: "debit" | "credit";
  aliases: string[];
  identifierFragments: string[];
  smsSenderIds: string[];
  balance: string;
  lowBalance: string;
  creditLimit: string;
  statementDay: string;
  dueDay: string;
};

const DEFAULT_COLOR = "#a78bfa";

function initialState(card: Card | null, unit: ReturnType<typeof usePrefs>["unit"]): FormState {
  return {
    name: card?.name ?? "",
    bank: card?.bank ?? "other",
    color: card?.color ?? DEFAULT_COLOR,
    cardType: card?.cardType ?? "debit",
    aliases: card?.aliases ?? [],
    identifierFragments: card?.identifierFragments ?? [],
    smsSenderIds: card?.smsSenderIds ?? [],
    balance:
      card?.lastKnownBalanceRial === null || card?.lastKnownBalanceRial === undefined
        ? ""
        : (card.lastKnownBalanceRial < 0 ? "-" : "") + rialToInputString(Math.abs(card.lastKnownBalanceRial), unit),
    lowBalance: rialToInputString(card?.lowBalanceThresholdRial, unit),
    creditLimit: rialToInputString(card?.creditLimitRial, unit),
    statementDay: card?.statementDay?.toString() ?? "",
    dueDay: card?.dueDay?.toString() ?? "",
  };
}

export function CardFormDialog({
  open,
  onOpenChange,
  card,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: Card | null;
}) {
  const { unit } = usePrefs();
  const [form, setForm] = useState<FormState>(() => initialState(card, unit));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors({});
  };

  function optionalRial(
    value: string,
    field: string,
    errs: Record<string, string>,
    allowNegative = false,
  ): number | null {
    const v = value.trim();
    if (v === "") return null;
    const negative = allowNegative && v.startsWith("-");
    const rial = inputStringToRial(negative ? v.slice(1) : v, unit);
    if (rial === null) {
      errs[field] = "Enter a valid amount";
      return null;
    }
    return negative ? -rial : rial;
  }

  function optionalDay(value: string): number | null {
    const n = Number(value);
    return value.trim() === "" || !Number.isFinite(n) ? null : n;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const data: CardInput = {
      name: form.name,
      bank: form.bank,
      color: form.color,
      cardType: form.cardType,
      aliases: form.aliases,
      identifierFragments: form.identifierFragments,
      smsSenderIds: form.smsSenderIds,
      lastKnownBalanceRial: optionalRial(form.balance, "lastKnownBalanceRial", errs, true),
      lowBalanceThresholdRial: optionalRial(form.lowBalance, "lowBalanceThresholdRial", errs),
      creditLimitRial: optionalRial(form.creditLimit, "creditLimitRial", errs),
      statementDay: optionalDay(form.statementDay),
      dueDay: optionalDay(form.dueDay),
    };
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    startTransition(async () => {
      const res = card ? await updateCard({ id: card.id, data }) : await createCard(data);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(card ? "Card updated" : "Card added");
      onOpenChange(false);
    });
  }

  const previewBalance = (() => {
    const v = form.balance.trim();
    if (!v) return null;
    const neg = v.startsWith("-");
    const r = inputStringToRial(neg ? v.slice(1) : v, unit);
    return r === null ? null : neg ? -r : r;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{card ? "Edit card" : "Add card"}</DialogTitle>
          <DialogDescription>How this card looks, and how SMS and the bot recognise it.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-6 md:grid-cols-[15rem_1fr]">
          <div className="flex flex-col gap-4">
            <CardVisual
              compact
              card={{
                name: form.name || "Card name",
                bank: form.bank,
                color: form.color,
                cardType: form.cardType,
                identifierFragments: form.identifierFragments,
                lastKnownBalanceRial: previewBalance,
                balanceUpdatedAt: null,
              }}
            />
            <Field label="Color">
              <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
            </Field>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" htmlFor="card-name" error={errors.name} className="col-span-2 sm:col-span-1">
                <Input
                  id="card-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  dir="auto"
                  autoFocus
                />
              </Field>
              <Field label="Bank" className="col-span-2 sm:col-span-1">
                <Select value={form.bank} onValueChange={(v) => set("bank", v as FormState["bank"])}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BANK_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l.en} <span className="font-persian text-muted-foreground">{l.fa}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Type">
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.cardType}
                onValueChange={(v) => v && set("cardType", v as FormState["cardType"])}
                className="w-full"
              >
                <ToggleGroupItem value="debit" className="flex-1">
                  Debit
                </ToggleGroupItem>
                <ToggleGroupItem value="credit" className="flex-1">
                  Credit
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>

            <Field
              label="SMS senders"
              hint="Exact sender shown on your phone (e.g. a number or name), or the bank app's package name for notifications."
              error={errors.smsSenderIds}
            >
              <TagInput
                value={form.smsSenderIds}
                onChange={(v) => set("smsSenderIds", v)}
                placeholder="Type and press Enter"
              />
            </Field>
            <Field
              label="Card / account identifiers"
              hint="Masked fragments that appear in SMS, e.g. 1234 or 6037***1234. Never the full card number."
              error={errors.identifierFragments}
            >
              <TagInput
                value={form.identifierFragments}
                onChange={(v) => set("identifierFragments", v)}
                placeholder="Last 4 digits…"
              />
            </Field>
            <Field
              label="Names for the Telegram bot"
              hint="Words that select this card in quick entries, in English and Persian."
              error={errors.aliases}
            >
              <TagInput value={form.aliases} onChange={(v) => set("aliases", v)} placeholder="mellat, ملت" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Current balance"
                htmlFor="card-balance"
                hint="Updated automatically from SMS."
                error={errors.lastKnownBalanceRial}
              >
                <AmountInput
                  id="card-balance"
                  value={form.balance}
                  onChange={(v) => set("balance", v)}
                  placeholder="Unknown"
                />
              </Field>
              <Field
                label="Low balance alert"
                htmlFor="card-low"
                hint="Optional threshold."
                error={errors.lowBalanceThresholdRial}
              >
                <AmountInput
                  id="card-low"
                  value={form.lowBalance}
                  onChange={(v) => set("lowBalance", v)}
                  placeholder="Off"
                />
              </Field>
            </div>

            {form.cardType === "credit" && (
              <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3 animate-in fade-in slide-in-from-top-1">
                <Field label="Credit limit" htmlFor="card-limit" className="col-span-3" error={errors.creditLimitRial}>
                  <AmountInput id="card-limit" value={form.creditLimit} onChange={(v) => set("creditLimit", v)} />
                </Field>
                <Field
                  label="Statement day"
                  htmlFor="card-stmt"
                  className="col-span-3 sm:col-span-1"
                  error={errors.statementDay}
                >
                  <Input
                    id="card-stmt"
                    inputMode="numeric"
                    value={form.statementDay}
                    onChange={(e) => set("statementDay", e.target.value)}
                    placeholder="1–31"
                  />
                </Field>
                <Field label="Due day" htmlFor="card-due" className="col-span-3 sm:col-span-1" error={errors.dueDay}>
                  <Input
                    id="card-due"
                    inputMode="numeric"
                    value={form.dueDay}
                    onChange={(e) => set("dueDay", e.target.value)}
                    placeholder="1–31"
                  />
                </Field>
              </div>
            )}
          </div>

          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {card ? "Save changes" : "Add card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
