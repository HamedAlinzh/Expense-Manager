import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.import") };

export default function Page() {
  return <ComingSoon title="nav.import" subtitle="page.import.subtitle" icon={FileUp} phase={6} />;
}
