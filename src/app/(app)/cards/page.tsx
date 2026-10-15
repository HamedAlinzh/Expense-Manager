import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.cards") };

export default function Page() {
  return <ComingSoon title="nav.cards" subtitle="page.cards.subtitle" icon={CreditCard} phase={2} />;
}
