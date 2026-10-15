import { LogOut } from "lucide-react";
import { cn } from "cn";
import { logoutAction } from "@/app/login/actions";
import { t } from "@/lib/i18n";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors",
          "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <LogOut className="size-4" aria-hidden />
        {t("nav.logout")}
      </button>
    </form>
  );
}
