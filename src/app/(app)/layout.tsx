import { BottomNav } from "@/components/app-shell/bottom-nav";
import { LogoutButton } from "@/components/app-shell/logout-button";
import { MobileHeader } from "@/components/app-shell/mobile-header";
import { Sidebar } from "@/components/app-shell/sidebar";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <MobileHeader />
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</div>
      </main>
      <BottomNav logout={<LogoutButton />} />
    </div>
  );
}
