import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app-shell/logo";
import { getSession } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("login.submit") };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if ((await getSession()).authenticated) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <div className="rounded-3xl border border-border bg-card/80 p-7 shadow-2xl shadow-black/40 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("login.subtitle")}</p>
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
      </div>
    </main>
  );
}
