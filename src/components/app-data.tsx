"use client";

import { createContext, type ReactNode, use } from "react";
import type { CategoryLite } from "@/components/categories/category-badge";

export type CardLite = { id: number; name: string; color: string; bank: string; archived: boolean };

export type AppData = { cards: CardLite[]; categories: CategoryLite[]; defaultCardId: number | null };

const AppDataContext = createContext<AppData>({ cards: [], categories: [], defaultCardId: null });

/** Reference data (cards, categories) loaded once in the app layout for pickers and labels. */
export function AppDataProvider({ value, children }: { value: AppData; children: ReactNode }) {
  return <AppDataContext value={value}>{children}</AppDataContext>;
}

export function useAppData(): AppData {
  return use(AppDataContext);
}
