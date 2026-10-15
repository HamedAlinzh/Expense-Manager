import {
  BellRing,
  FileSpreadsheet,
  Keyboard,
  Link2,
  type LucideIcon,
  MessageSquareText,
  Send,
  Split,
} from "lucide-react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SOURCE_LABELS, type TxSource } from "@/lib/schemas/transaction";

export const SOURCE_ICONS: Record<TxSource, LucideIcon> = {
  manual: Keyboard,
  csv: FileSpreadsheet,
  sms: MessageSquareText,
  notification: BellRing,
  telegram: Send,
};

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SourceIcon({ source, className }: { source: TxSource; className?: string }) {
  const Icon = SOURCE_ICONS[source];
  return (
    <Hint label={SOURCE_LABELS[source]}>
      <span
        className={cn("inline-grid size-6 place-items-center rounded-md text-muted-foreground", className)}
        aria-label={SOURCE_LABELS[source]}
      >
        <Icon className="size-3.5" />
      </span>
    </Hint>
  );
}

export function StatusPill({ status }: { status: "pending_review" | "confirmed" }) {
  if (status === "confirmed") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[0.7rem] font-medium text-amber-300 ring-1 ring-amber-400/25">
      <span className="size-1.5 rounded-full bg-amber-300" /> Review
    </span>
  );
}

export function MatchedIcon() {
  return (
    <Hint label="Matched with another source (no duplicate created)">
      <span className="inline-grid size-6 place-items-center rounded-md text-sky-400" aria-label="Matched">
        <Link2 className="size-3.5" />
      </span>
    </Hint>
  );
}

export function SplitBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="grid size-5 place-items-center rounded-md bg-muted">
        <Split className="size-3" />
      </span>
      Split · {count}
    </span>
  );
}
