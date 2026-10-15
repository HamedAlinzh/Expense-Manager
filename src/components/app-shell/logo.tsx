import { WalletCards } from "lucide-react";
import { cn } from "cn";
import { t } from "@/lib/i18n";

export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-8 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
        <WalletCards className="size-4.5" aria-hidden />
      </span>
      {withName && <span className="text-[0.95rem] font-semibold tracking-tight">{t("app.name")}</span>}
    </div>
  );
}
