import type { Metadata } from "next";
import { Target } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.budgets") };

export default function Page() {
  return <ComingSoon title="nav.budgets" subtitle="page.budgets.subtitle" icon={Target} phase={7} />;
}
