import type { Metadata } from "next";
import { CardsView } from "@/components/cards/cards-view";
import { currentJalaliMonth, formatJalaliMonthKey, jalaliMonthRange, monthKey } from "@/lib/format/time";
import { listCardsWithStats } from "@/server/queries/cards";

export const metadata: Metadata = { title: "Cards" };

export default async function CardsPage() {
  const { jy, jm } = currentJalaliMonth();
  const cards = await listCardsWithStats(jalaliMonthRange(jy, jm));
  return <CardsView cards={cards} monthLabel={formatJalaliMonthKey(monthKey(jy, jm))} />;
}
