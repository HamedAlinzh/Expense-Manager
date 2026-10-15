import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.dashboard") };

export default function Page() {
  return <ComingSoon title="nav.dashboard" subtitle="page.dashboard.subtitle" icon={LayoutDashboard} phase={3} />;
}
