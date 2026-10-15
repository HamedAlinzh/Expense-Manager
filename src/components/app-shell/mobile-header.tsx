import { Logo } from "./logo";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background/85 px-4 backdrop-blur-xl lg:hidden">
      <Logo />
    </header>
  );
}
