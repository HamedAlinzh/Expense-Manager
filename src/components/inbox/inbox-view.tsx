"use client";

import {
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  FlaskConical,
  Inbox,
  LoaderCircle,
  MessageSquareOff,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  addSenderToCard,
  confirmTransactions,
  deleteMessage,
  dismissMessage,
  reparseMessages,
} from "@/app/(app)/inbox/actions";
import { deleteTransaction } from "@/app/(app)/transactions/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { useAppData } from "@/components/app-data";
import { CategoryBadge } from "@/components/categories/category-badge";
import { RawMessage } from "@/components/common/bidi-text";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { DateTime, Money } from "@/components/prefs/display";
import { CardBadge } from "@/components/transactions/card-picker";
import { TxDrawer } from "@/components/transactions/tx-drawer";
import { SourceIcon } from "@/components/transactions/tx-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PendingTx, RawMessageRow } from "@/server/queries/inbox";
import { CreateFromMessageDialog } from "./create-from-message-dialog";
import { TestMessageDialog } from "./test-message-dialog";

function RawText({ body, className }: { body: string; className?: string }) {
  return (
    <RawMessage
      body={body}
      className={cn("rounded-xl bg-muted/40 px-3 py-2 text-[0.8rem] text-foreground/90", className)}
    />
  );
}

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = <T,>(
    p: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    success?: (data: T) => string,
  ) =>
    startTransition(async () => {
      const res = await p();
      if (res.ok) {
        if (success) toast.success(success(res.data));
      } else toast.error(res.error);
    });
  return { pending, run };
}

export function InboxView({
  pending,
  unparsed,
  ignored,
}: {
  pending: PendingTx[];
  unparsed: RawMessageRow[];
  ignored: RawMessageRow[];
}) {
  const [tab, setTab] = useState(pending.length === 0 && unparsed.length > 0 ? "unparsed" : "review");
  const [testOpen, setTestOpen] = useState(false);
  const { pending: busy, run } = useRun();

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Transactions and messages waiting for your review"
        actions={
          <>
            <Button variant="outline" onClick={() => setTestOpen(true)}>
              <FlaskConical /> Test a message
            </Button>
            {unparsed.length > 0 && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => reparseMessages({}),
                    (d) => `Re-parsed ${d.processed} · ${d.created} became transactions`,
                  )
                }
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Re-parse all
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="review">
            Needs review {pending.length > 0 && <Badge className="ml-1">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="unparsed">
            Unparsed {unparsed.length > 0 && <Badge className="ml-1">{unparsed.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ignored">Ignored</TabsTrigger>
        </TabsList>
        <TabsContent value="review">
          <PendingList items={pending} />
        </TabsContent>
        <TabsContent value="unparsed">
          <UnparsedList items={unparsed} />
        </TabsContent>
        <TabsContent value="ignored">
          <IgnoredList items={ignored} />
        </TabsContent>
      </Tabs>

      <TestMessageDialog open={testOpen} onOpenChange={setTestOpen} />
    </>
  );
}

function PendingList({ items }: { items: PendingTx[] }) {
  const { cards, categories } = useAppData();
  const [openId, setOpenId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<PendingTx | null>(null);
  const { pending, run } = useRun();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="All caught up"
        body="Transactions the parser wasn't sure about will wait here for a quick check."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} transactions need a look. Confirm if they&apos;re right, or open one to fix it.
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(
              () => confirmTransactions({ ids: items.map((i) => i.id) }),
              (d) => `Confirmed ${d.confirmed}`,
            )
          }
        >
          <CheckCheck /> Confirm all
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((t) => {
          const card = cards.find((c) => c.id === t.cardId);
          const category = categories.find((c) => c.id === t.categoryId);
          return (
            <li key={t.id} className="rounded-2xl border border-border bg-card p-4 animate-in fade-in">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium" dir="auto">
                      {t.merchant || t.description || "Untitled"}
                    </p>
                    {card ? (
                      <CardBadge card={card} />
                    ) : (
                      <Badge variant="outline" className="border-amber-400/40 text-amber-300">
                        No card
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <DateTime date={t.occurredAt} time />
                    <SourceIcon source={t.source} className="size-5" />
                    {t.confidence !== null && <span>confidence {Math.round(t.confidence * 100)}%</span>}
                    <CategoryBadge category={category} className="text-xs" />
                  </p>
                  {t.notes && t.notes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.notes.map((n) => (
                        <span
                          key={n}
                          className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[0.7rem] text-amber-200/90"
                          dir="auto"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Money rial={t.amountRial} kind={t.type} direction={t.direction} className="text-lg font-semibold" />
              </div>
              {t.rawBody && (
                <Collapsible className="mt-3">
                  <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />{" "}
                    Original message from <span dir="ltr">{t.rawSender}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <RawText body={t.rawBody} />
                  </CollapsibleContent>
                </Collapsible>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setToDelete(t)}
                >
                  <Trash2 /> Delete
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpenId(t.id)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => confirmTransactions({ ids: [t.id] }),
                      () => "Confirmed",
                    )
                  }
                >
                  <Check /> Confirm
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <TxDrawer id={openId} onClose={() => setOpenId(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this transaction?"
        description="Use this for messages that aren't real transactions. The original message is kept."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteTransaction({ id: toDelete.id });
          if (res.ok) toast.success("Deleted");
          else toast.error(res.error);
          setToDelete(null);
        }}
      />
    </>
  );
}

function UnparsedList({ items }: { items: RawMessageRow[] }) {
  const [creating, setCreating] = useState<RawMessageRow | null>(null);
  const { pending, run } = useRun();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No unparsed messages"
        body="Bank messages the parsers can't read show up here so you can record them by hand."
      />
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((m) => (
          <li key={m.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span dir="ltr" className="font-medium text-foreground">
                {m.sender}
              </span>
              <DateTime date={m.receivedAt} time />
              <Badge variant="outline">{m.source}</Badge>
              {m.parseStatus === "failed" && <Badge variant="destructive">failed</Badge>}
              {m.error && <span className="text-amber-300/90">{m.error}</span>}
            </div>
            <RawText body={m.body ?? ""} />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => dismissMessage({ id: m.id }),
                    () => "Dismissed",
                  )
                }
              >
                <Ban /> Not a transaction
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => reparseMessages({ ids: [m.id] }),
                    (d) => (d.created ? "Parsed into a transaction" : "Still not recognised"),
                  )
                }
              >
                <RefreshCw /> Re-parse
              </Button>
              <Button size="sm" onClick={() => setCreating(m)}>
                <Plus /> Create transaction
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {creating && <CreateFromMessageDialog key={creating.id} message={creating} onClose={() => setCreating(null)} />}
    </>
  );
}

const REASONS: Record<string, { label: string; icon: typeof Ban }> = {
  otp_discarded: { label: "One-time password — content discarded, never stored", icon: ShieldAlert },
  unknown_sender: { label: "Sender isn't linked to any card", icon: UserRoundX },
  unknown_sender_not_bank: { label: "Unknown sender, not a bank message — content not stored", icon: UserRoundX },
  dismissed: { label: "Dismissed by you", icon: MessageSquareOff },
};

function IgnoredList({ items }: { items: RawMessageRow[] }) {
  const { cards } = useAppData();
  const { pending, run } = useRun();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title="Nothing ignored"
        body="One-time passwords and messages from unknown senders are listed here."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((m) => {
        const reason = REASONS[m.error ?? ""] ?? { label: m.error ?? "Ignored", icon: Ban };
        const Icon = reason.icon;
        return (
          <li key={m.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Icon className="size-3.5" />
              <span>{reason.label}</span>
              <span className="mx-1">·</span>
              <span dir="ltr" className="font-medium text-foreground">
                {m.sender}
              </span>
              <DateTime date={m.receivedAt} time />
            </div>
            {m.body && <RawText body={m.body} className="mt-2" />}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteMessage({ id: m.id }),
                    () => "Deleted",
                  )
                }
              >
                <Trash2 /> Delete
              </Button>
              {m.error === "unknown_sender" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={pending}>
                      <Plus /> Add sender to card
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Messages from “{m.sender}” belong to…</DropdownMenuLabel>
                    {cards
                      .filter((c) => !c.archived)
                      .map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onSelect={() =>
                            run(
                              () => addSenderToCard({ rawId: m.id, cardId: c.id }),
                              (d) =>
                                `Sender added to ${c.name} · ${d.created} of ${d.processed} messages became transactions`,
                            )
                          }
                        >
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} /> {c.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
