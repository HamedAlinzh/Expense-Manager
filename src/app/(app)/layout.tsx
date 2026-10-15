import { AppDataProvider } from "@/components/app-data";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { LogoutButton } from "@/components/app-shell/logout-button";
import { MobileHeader } from "@/components/app-shell/mobile-header";
import { Sidebar } from "@/components/app-shell/sidebar";
import { PrefsProvider } from "@/components/prefs/prefs-provider";
import { QuickAddProvider } from "@/components/transactions/quick-add";
import { requireSession } from "@/lib/auth/session";
import { listCards } from "@/server/queries/cards";
import { listCategories } from "@/server/queries/categories";
import { getPrefs, getSettings } from "@/server/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  const [prefs, settings, cards, categories] = await Promise.all([
    getPrefs(),
    getSettings(),
    listCards({ includeArchived: true }),
    listCategories({ includeArchived: true }),
  ]);
  const appData = {
    cards: cards.map((c) => ({ id: c.id, name: c.name, color: c.color, bank: c.bank, archived: c.archived })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      kind: c.kind,
      parentId: c.parentId,
      archived: c.archived,
    })),
    defaultCardId: settings.defaultCardId,
  };

  return (
    <PrefsProvider prefs={prefs}>
      <AppDataProvider value={appData}>
        <QuickAddProvider>
          <div className="min-h-dvh">
            <Sidebar />
            <MobileHeader />
            <main className="lg:pl-64">
              <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
                {children}
              </div>
            </main>
            <BottomNav logout={<LogoutButton />} />
          </div>
        </QuickAddProvider>
      </AppDataProvider>
    </PrefsProvider>
  );
}
