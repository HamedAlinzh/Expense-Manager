"use client";

import { Archive, ArchiveRestore, CreditCard, EllipsisVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCard, setCardArchived } from "@/app/(app)/cards/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/prefs/display";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardWithStats } from "@/server/queries/cards";
import { CardFormDialog } from "./card-form-dialog";
import { CardVisual } from "./card-visual";

export function CardsView({ cards, monthLabel }: { cards: CardWithStats[]; monthLabel: string }) {
  const [editing, setEditing] = useState<CardWithStats | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [toDelete, setToDelete] = useState<CardWithStats | null>(null);
  const [, startTransition] = useTransition();

  const active = cards.filter((c) => !c.archived);
  const archived = cards.filter((c) => c.archived);

  function openForm(card: CardWithStats | null) {
    setEditing(card);
    setFormKey((k) => k + 1); // fresh form state each time
    setFormOpen(true);
  }

  function toggleArchive(card: CardWithStats) {
    startTransition(async () => {
      const res = await setCardArchived({ id: card.id, archived: !card.archived });
      if (res.ok) toast.success(card.archived ? `${card.name} restored` : `${card.name} archived`);
      else toast.error(res.error);
    });
  }

  return (
    <>
      <PageHeader
        title="Cards"
        subtitle={`Bank cards, SMS senders and balances · spending for ${monthLabel}`}
        actions={
          <Button onClick={() => openForm(null)}>
            <Plus /> Add card
          </Button>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No cards yet"
          body="Add your bank cards so SMS messages and bot entries can be matched to them."
          action={<Button onClick={() => openForm(null)}>Add your first card</Button>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              onEdit={() => openForm(card)}
              onArchive={() => toggleArchive(card)}
              onDelete={() => setToDelete(card)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Archived</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                onEdit={() => openForm(card)}
                onArchive={() => toggleArchive(card)}
                onDelete={() => setToDelete(card)}
              />
            ))}
          </div>
        </section>
      )}

      <CardFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} card={editing} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name}?`}
        description="Cards with transactions can't be deleted; archive them instead to keep your history."
        confirmLabel="Delete card"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteCard({ id: toDelete.id });
          if (res.ok) toast.success("Card deleted");
          else toast.error(res.error);
          setToDelete(null);
        }}
      />
    </>
  );
}

function CardTile({
  card,
  onEdit,
  onArchive,
  onDelete,
}: {
  card: CardWithStats;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const placeholderSenders = card.smsSenderIds.some((s) => s.startsWith("PLACEHOLDER"));
  return (
    <div className="group flex flex-col gap-3">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-2xl text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        aria-label={`Edit ${card.name}`}
      >
        <CardVisual card={card} />
      </button>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <Link
          href={`/transactions?card=${card.id}`}
          className="grid flex-1 grid-cols-3 gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Stat label="Spent">
            <Money rial={card.monthSpentRial} className="text-expense" compact={card.monthSpentRial >= 100_000_000} />
          </Stat>
          <Stat label="Income">
            <Money rial={card.monthIncomeRial} className="text-income" compact={card.monthIncomeRial >= 100_000_000} />
          </Stat>
          <Stat label="Txns">
            <span className="amount">{card.monthCount}</span>
          </Stat>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${card.name} actions`}>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive}>
              {card.archived ? <ArchiveRestore /> : <Archive />}
              {card.archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete} disabled={card.totalCount > 0}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {placeholderSenders && !card.archived && (
        <p className="px-1 text-xs text-amber-400/90">
          Set this card&apos;s real SMS sender so messages can be matched.
        </p>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] text-muted-foreground">{label}</p>
      <div className="truncate text-sm font-medium">{children}</div>
    </div>
  );
}
