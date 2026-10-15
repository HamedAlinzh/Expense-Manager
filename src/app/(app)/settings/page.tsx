import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.settings") };

export default function Page() {
  return <ComingSoon title="nav.settings" subtitle="page.settings.subtitle" icon={Settings} phase={2} />;
}
