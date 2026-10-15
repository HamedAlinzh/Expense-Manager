"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import { allNavItems, isActive, mobilePrimary } from "./nav";

const itemClass =
  "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.68rem] font-medium transition-colors focus-visible:outline-none focus-visible:text-foreground";

/** Mobile bottom navigation; secondary destinations open in a bottom sheet. */
export function BottomNav({ logout }: { logout: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = allNavItems.filter((i) => mobilePrimary.includes(i.href));
  const secondary = allNavItems.filter((i) => !mobilePrimary.includes(i.href));
  const moreActive = secondary.some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur-xl safe-bottom lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(itemClass, active ? "text-foreground" : "text-muted-foreground")}
            >
              <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
              {t(item.short ?? item.label)}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className={cn(itemClass, moreActive || open ? "text-foreground" : "text-muted-foreground")}>
            <Ellipsis className={cn("size-5", moreActive && "text-primary")} aria-hidden />
            {t("nav.more")}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl border-t border-border pb-[max(env(safe-area-inset-bottom),1rem)]">
            <SheetHeader>
              <SheetTitle>{t("nav.more")}</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 px-4">
              {secondary.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center text-xs transition-colors hover:bg-accent",
                      active && "border-primary/40 text-foreground",
                    )}
                  >
                    <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    {t(item.short ?? item.label)}
                  </Link>
                );
              })}
            </div>
            <div className="px-4 pt-2">{logout}</div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
