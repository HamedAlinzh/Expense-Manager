import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.categories") };

export default function Page() {
  return <ComingSoon title="nav.categories" subtitle="page.categories.subtitle" icon={Tags} phase={2} />;
}
