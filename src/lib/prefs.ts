import type { MoneyUnit } from "@/lib/format/money";
import type { CalendarKind } from "@/lib/format/time";

/** Display preferences, loaded from settings on the server and shared with client components. */
export type Prefs = {
  unit: MoneyUnit;
  calendar: CalendarKind;
  digits: "latin" | "persian";
};

export const defaultPrefs: Prefs = { unit: "toman", calendar: "jalali", digits: "latin" };
