import { Logo } from "./logo";
import { LogoutButton } from "./logout-button";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ badges }: { badges: Record<string, number> }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav badges={badges} />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
