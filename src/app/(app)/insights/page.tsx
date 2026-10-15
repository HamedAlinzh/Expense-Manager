import type { Metadata } from "next";
import { ChartPie } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.insights") };

export default function Page() {
  return <ComingSoon title="nav.insights" subtitle="page.insights.subtitle" icon={ChartPie} phase={7} />;
}
