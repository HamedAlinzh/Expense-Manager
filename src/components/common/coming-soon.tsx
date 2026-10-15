import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { t, type MessageKey } from "@/lib/i18n";

/** Temporary page body for sections scheduled in later build phases. */
export function ComingSoon({
  title,
  subtitle,
  icon,
  phase,
}: {
  title: MessageKey;
  subtitle: MessageKey;
  icon: LucideIcon;
  phase: number;
}) {
  return (
    <>
      <PageHeader title={t(title)} subtitle={t(subtitle)} />
      <EmptyState icon={icon} title={t("empty.comingSoon", { phase })} body={t("empty.comingSoonBody")} />
    </>
  );
}
