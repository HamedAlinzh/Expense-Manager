"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { t } from "@/lib/i18n";
import { isActive, navGroups } from "./nav";

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-[0.7rem] font-medium tracking-wider text-muted-foreground/70 uppercase">
            {t(group.label)}
          </p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors",
                  "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active && "bg-sidebar-accent text-foreground",
                )}
              >
                <Icon
                  className={cn("size-4 transition-colors", active ? "text-primary" : "group-hover:text-foreground")}
                  aria-hidden
                />
                {t(item.label)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
