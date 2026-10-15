"use client";

import { DatabaseBackup, Download, LoaderCircle, LogOut, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { backupNow, logoutEverywhere, updateSettings } from "@/app/(app)/settings/actions";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateTime } from "@/components/prefs/display";
import { PageHeader } from "@/components/app-shell/page-header";
import { useAppData } from "@/components/app-data";
import { CardPicker } from "@/components/transactions/card-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Settings } from "@/db/schema";
import { formatMoney } from "@/lib/format/money";
import { formatDate } from "@/lib/format/time";

type Patch = Parameters<typeof updateSettings>[0];
type BackupFile = { name: string; bytes: number; createdAt: Date };

const size = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-8 first:pt-0 last:border-0 md:grid-cols-[16rem_1fr] md:gap-10">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsView({
  settings,
  backups,
  backupDir,
}: {
  settings: Settings;
  backups: BackupFile[];
  backupDir: string;
}) {
  const { cards } = useAppData();
  const [s, setS] = useState(settings);
  const [, startTransition] = useTransition();
  const sample = new Date("2026-10-15T11:02:00Z"); // fixed, so server and client render the same example

  function save(patch: Patch) {
    const prev = s;
    setS({ ...s, ...patch } as Settings);
    startTransition(async () => {
      const res = await updateSettings(patch);
      if (res.ok) toast.success("Saved");
      else {
        setS(prev);
        toast.error(res.error);
      }
    });
  }

  const toggles: { key: keyof Patch & keyof Settings; label: string; hint: string }[] = [
    { key: "notifyBudgetAlerts", label: "Budget alerts", hint: "When a category passes 80% or 100% of its budget." },
    { key: "notifyRecurring", label: "Recurring payments", hint: "Price increases and missing expected charges." },
    {
      key: "notifyAnomalies",
      label: "Unusual transactions",
      hint: "Amounts far above your usual for a category or merchant.",
    },
    { key: "notifyLowBalance", label: "Low balance", hint: "Uses each card's threshold and the latest SMS balance." },
    { key: "weeklySummary", label: "Weekly summary", hint: "Friday mornings." },
    { key: "monthlySummary", label: "Monthly summary", hint: "On the first day of each Jalali month." },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Display, bot and data preferences" />

      <Section title="Display" description="How amounts and dates appear across the app.">
        <Row label="Currency unit" hint={`e.g. ${formatMoney(1_250_000, { unit: s.displayUnit })}`}>
          <ToggleGroup
            type="single"
            variant="outline"
            value={s.displayUnit}
            onValueChange={(v) => v && save({ displayUnit: v as Settings["displayUnit"] })}
          >
            <ToggleGroupItem value="toman">Toman</ToggleGroupItem>
            <ToggleGroupItem value="thousand_toman">Thousand T</ToggleGroupItem>
            <ToggleGroupItem value="rial">Rial</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row
          label="Calendar"
          hint={`e.g. ${formatDate(sample, { calendar: s.calendar, time: true })} · months and budgets always follow the Jalali calendar`}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            value={s.calendar}
            onValueChange={(v) => v && save({ calendar: v as Settings["calendar"] })}
          >
            <ToggleGroupItem value="jalali">Jalali</ToggleGroupItem>
            <ToggleGroupItem value="gregorian">Gregorian</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>

      <Section title="Telegram bot" description="Quick entries without a card name go to the default card.">
        <div>
          <p className="mb-2 text-sm">Default card</p>
          <CardPicker
            cards={cards.filter((c) => !c.archived)}
            value={s.defaultCardId}
            onChange={(id) => id && save({ defaultCardId: id })}
          />
        </div>
      </Section>

      <Section title="Matching" description="Used when SMS, imports and manual entries describe the same money.">
        <Row
          label="Duplicate window"
          hint="Same card and amount within this many minutes is treated as one transaction."
        >
          <MinutesInput value={s.dedupeWindowMinutes} onCommit={(v) => save({ dedupeWindowMinutes: v })} />
        </Row>
        <Row
          label="Transfer window"
          hint="An expense and an equal income on two of your cards within this window become a transfer."
        >
          <MinutesInput value={s.transferWindowMinutes} onCommit={(v) => save({ transferWindowMinutes: v })} />
        </Row>
      </Section>

      <Section title="Notifications" description="Delivered by the Telegram bot once it's connected.">
        {toggles.map((t) => (
          <Row key={t.key} label={t.label} hint={t.hint}>
            <Switch checked={Boolean(s[t.key])} onCheckedChange={(v) => save({ [t.key]: v })} aria-label={t.label} />
          </Row>
        ))}
      </Section>

      <Section title="Data" description="Your data stays on your server.">
        <Row label="Export everything" hint="Cards, categories, rules, transactions, budgets and raw messages as JSON.">
          <Button variant="outline" asChild>
            <a href="/api/export" download>
              <Download /> Download backup
            </a>
          </Button>
        </Row>
        <RestoreRow />
      </Section>

      <Section
        title="Database backups"
        description={`Automatic every night at 03:30 (Tehran); the newest 14 are kept in ${backupDir}.`}
      >
        <BackupsPanel backups={backups} />
      </Section>

      <Section title="Security">
        <Row label="Log out everywhere" hint="Ends all sessions on all devices, including this one.">
          <form action={logoutEverywhere}>
            <Button variant="destructive" type="submit">
              <LogOut /> Log out all devices
            </Button>
          </form>
        </Row>
      </Section>
    </>
  );
}

function MinutesInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 1 && n <= 1440 && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        className="amount w-20 text-right"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <span className="text-sm text-muted-foreground">min</span>
    </div>
  );
}

function BackupsPanel({ backups }: { backups: BackupFile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await backupNow({});
              if (res.ok) {
                toast.success(`Backup written: ${res.data.name} (${size(res.data.bytes)})`);
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />} Back up now
        </Button>
      </div>
      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No database backups yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {backups.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate font-mono text-xs">{b.name}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <DateTime date={b.createdAt} time />
                <span className="amount w-16 text-right">{size(b.bytes)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Restoring a database backup is done on the server — see “Backup &amp; restore” in the README.
      </p>
    </div>
  );
}

function RestoreRow() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  async function restore() {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/import/backup", { method: "POST", body });
    const json = (await res.json().catch(() => ({}))) as { error?: string; counts?: Record<string, number> };
    if (!res.ok) {
      toast.error(json.error ?? "Restore failed");
    } else {
      toast.success(`Restored ${json.counts?.transactions ?? 0} transactions and ${json.counts?.cards ?? 0} cards`);
      router.refresh();
    }
    setFile(null);
    if (input.current) input.current.value = "";
  }

  return (
    <Row label="Restore from backup" hint="Replaces ALL current data with a JSON backup file.">
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button variant="outline" onClick={() => input.current?.click()}>
        <Upload /> Choose file…
      </Button>
      <ConfirmDialog
        open={file !== null}
        onOpenChange={(o) => {
          if (!o) {
            setFile(null);
            if (input.current) input.current.value = "";
          }
        }}
        title="Replace all data?"
        description={`Everything currently in the app will be replaced with the contents of “${file?.name ?? ""}”. Download a fresh backup first if you might need today's data.`}
        confirmLabel="Replace everything"
        destructive
        onConfirm={restore}
      />
    </Row>
  );
}
