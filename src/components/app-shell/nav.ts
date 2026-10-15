import type { Route } from "next";
import {
  ArrowLeftRight,
  ChartPie,
  CreditCard,
  FileUp,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Repeat,
  Settings,
  Tags,
  Target,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

export type NavItem = { href: Route; label: MessageKey; short?: MessageKey; icon: LucideIcon };
export type NavGroup = { label: MessageKey; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "nav.group.money",
    items: [
      { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
      { href: "/transactions", label: "nav.transactions", icon: ArrowLeftRight },
      { href: "/inbox", label: "nav.inbox", icon: Inbox },
      { href: "/cards", label: "nav.cards", icon: CreditCard },
    ],
  },
  {
    label: "nav.group.planning",
    items: [
      { href: "/budgets", label: "nav.budgets", icon: Target },
      { href: "/recurring", label: "nav.recurring", icon: Repeat },
      { href: "/insights", label: "nav.insights", icon: ChartPie },
      { href: "/categories", label: "nav.categories", short: "nav.categoriesShort", icon: Tags },
    ],
  },
  {
    label: "nav.group.system",
    items: [
      { href: "/import", label: "nav.import", icon: FileUp },
      { href: "/settings", label: "nav.settings", icon: Settings },
    ],
  },
];

export const allNavItems = navGroups.flatMap((g) => g.items);

/** Shown directly in the mobile bottom bar; everything else lives under "More". */
export const mobilePrimary: Route[] = ["/", "/transactions", "/inbox"];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
