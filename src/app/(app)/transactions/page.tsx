import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.transactions") };

export default function Page() {
  return <ComingSoon title="nav.transactions" subtitle="page.transactions.subtitle" icon={ArrowLeftRight} phase={2} />;
}
