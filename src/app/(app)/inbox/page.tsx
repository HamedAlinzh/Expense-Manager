import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("nav.inbox") };

export default function Page() {
  return <ComingSoon title="nav.inbox" subtitle="page.inbox.subtitle" icon={Inbox} phase={4} />;
}
