import { formatMoney } from "@/lib/format/money";
import { formatDate, formatTime } from "@/lib/format/time";

/** Escapes text for Telegram's HTML parse mode. */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bot replies always show Toman (the bot's input unit is thousand Toman). */
export function toman(rial: number, opts: { sign?: "auto" | "always" | "never" } = {}): string {
  return formatMoney(rial, { unit: "toman", sign: opts.sign ?? "auto" });
}

const ICON_EMOJI: Record<string, string> = {
  "shopping-basket": "🧺",
  "shopping-cart": "🛒",
  "shopping-bag": "🛍",
  utensils: "🍽",
  coffee: "☕",
  cake: "🎂",
  "car-taxi-front": "🚕",
  car: "🚗",
  bus: "🚌",
  train: "🚆",
  bike: "🚲",
  fuel: "⛽",
  plane: "✈️",
  receipt: "🧾",
  lightbulb: "💡",
  flame: "🔥",
  wifi: "📶",
  smartphone: "📱",
  house: "🏠",
  wrench: "🔧",
  "heart-pulse": "🩺",
  pill: "💊",
  stethoscope: "🩺",
  dumbbell: "🏋️",
  scissors: "✂️",
  shirt: "👕",
  sparkles: "✨",
  clapperboard: "🎬",
  "gamepad-2": "🎮",
  music: "🎵",
  "book-open": "📖",
  repeat: "🔁",
  "graduation-cap": "🎓",
  baby: "🍼",
  dog: "🐾",
  gift: "🎁",
  package: "📦",
  landmark: "🏛",
  "hand-coins": "🪙",
  briefcase: "💼",
  laptop: "💻",
  "arrow-down-left": "↙️",
  "undo-2": "↩️",
  "circle-plus": "➕",
  banknote: "💵",
  "piggy-bank": "🐷",
  "trending-up": "📈",
  wallet: "👛",
};

export function categoryEmoji(icon: string | null | undefined): string {
  return (icon && ICON_EMOJI[icon]) || "🏷";
}

export type TxLine = {
  type: "expense" | "income" | "transfer" | "refund";
  direction: "in" | "out";
  amountRial: number;
  description: string;
  merchant: string | null;
  occurredAt: Date;
};

/** "−50,000 T  ناهار · 14:32" — compact one-line form for lists. */
export function txLine(t: TxLine, opts: { withDate?: boolean } = {}): string {
  const out = t.direction === "out";
  const amount =
    t.type === "transfer" ? `↔ ${toman(t.amountRial)}` : toman(out ? -t.amountRial : t.amountRial, { sign: "always" });
  const when = opts.withDate ? formatDate(t.occurredAt, { time: true }) : formatTime(t.occurredAt);
  const title = t.merchant || t.description || (t.type === "transfer" ? "Transfer" : "—");
  return `<b>${esc(amount)}</b>  ${esc(title)} · <i>${when}</i>`;
}

/** A text progress bar, e.g. ▓▓▓▓▓▓░░░░ 62% */
export function bar(fraction: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}
