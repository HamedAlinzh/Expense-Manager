"use client";

import { createContext, type ReactNode, use } from "react";
import { defaultPrefs, type Prefs } from "@/lib/prefs";

const PrefsContext = createContext<Prefs>(defaultPrefs);

export function PrefsProvider({ prefs, children }: { prefs: Prefs; children: ReactNode }) {
  return <PrefsContext value={prefs}>{children}</PrefsContext>;
}

export function usePrefs(): Prefs {
  return use(PrefsContext);
}
