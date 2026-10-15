"use client";

import { Download, LogOut } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { logoutEverywhere, updateSettings } from "@/app/(app)/settings/actions";
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

export function SettingsView({ settings }: { settings: Settings }) {
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

      <Section title="Data" description="Your data stays on your server. Backups are plain JSON.">
        <Row label="Export everything" hint="Cards, categories, rules, transactions, budgets and raw messages.">
          <Button variant="outline" asChild>
            <a href="/api/export" download>
              <Download /> Download backup
            </a>
          </Button>
        </Row>
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
