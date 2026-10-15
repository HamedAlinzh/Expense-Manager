import type { Metadata } from "next";
import { Repeat } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.recurring") };

export default function Page() {
  return <ComingSoon title="nav.recurring" subtitle="page.recurring.subtitle" icon={Repeat} phase={7} />;
}
