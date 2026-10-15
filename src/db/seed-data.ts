import type { NewCard } from "./schema";

type SeedCategory = { name: string; icon: string; color: string; kind: "expense" | "income" };

/** Icons are lucide-react names (kebab-case). Colors are muted to sit well on the dark theme. */
export const seedCategories: SeedCategory[] = [
  { name: "Groceries", icon: "shopping-basket", color: "#4ade80", kind: "expense" },
  { name: "Dining & Cafe", icon: "utensils", color: "#fb923c", kind: "expense" },
  { name: "Transport & Taxi", icon: "car-taxi-front", color: "#facc15", kind: "expense" },
  { name: "Fuel", icon: "fuel", color: "#f87171", kind: "expense" },
  { name: "Bills & Utilities", icon: "receipt", color: "#60a5fa", kind: "expense" },
  { name: "Mobile & Internet", icon: "smartphone", color: "#22d3ee", kind: "expense" },
  { name: "Rent", icon: "house", color: "#a78bfa", kind: "expense" },
  { name: "Shopping", icon: "shopping-bag", color: "#f472b6", kind: "expense" },
  { name: "Health & Pharmacy", icon: "heart-pulse", color: "#34d399", kind: "expense" },
  { name: "Entertainment", icon: "clapperboard", color: "#c084fc", kind: "expense" },
  { name: "Subscriptions", icon: "repeat", color: "#818cf8", kind: "expense" },
  { name: "Education", icon: "graduation-cap", color: "#38bdf8", kind: "expense" },
  { name: "Travel", icon: "plane", color: "#2dd4bf", kind: "expense" },
  { name: "Gifts", icon: "gift", color: "#fb7185", kind: "expense" },
  { name: "Other", icon: "circle-ellipsis", color: "#a1a1aa", kind: "expense" },
  { name: "Salary", icon: "briefcase", color: "#4ade80", kind: "income" },
  { name: "Freelance", icon: "laptop", color: "#2dd4bf", kind: "income" },
  { name: "Transfer In", icon: "arrow-down-left", color: "#60a5fa", kind: "income" },
  { name: "Refund", icon: "undo-2", color: "#facc15", kind: "income" },
  { name: "Other Income", icon: "circle-plus", color: "#a1a1aa", kind: "income" },
];

/**
 * Sender IDs as they appear on the phone. Blu's is still a PLACEHOLDER — set it on the Cards page
 * once its first SMS arrives (unknown senders show up in the inbox with an "Add sender" button).
 * Account/card identifiers are learned automatically from the first SMS of each card.
 */
export const seedCards: NewCard[] = [
  {
    name: "Sepah",
    bank: "sepah",
    color: "#f59e0b",
    cardType: "debit",
    aliases: ["sepah", "سپه"],
    smsSenderIds: ["986715000"],
    sortOrder: 1,
  },
  {
    name: "Mellat",
    bank: "mellat",
    color: "#e11d48",
    cardType: "debit",
    aliases: ["mellat", "ملت"],
    smsSenderIds: ["Bank Mellat"],
    sortOrder: 2,
  },
  {
    name: "Tejarat",
    bank: "tejarat",
    color: "#2563eb",
    cardType: "debit",
    aliases: ["tejarat", "تجارت"],
    smsSenderIds: ["TejaratBank"],
    sortOrder: 3,
  },
  {
    name: "Blu",
    bank: "blu",
    color: "#06b6d4",
    cardType: "debit",
    aliases: ["blu", "blue", "بلو"],
    smsSenderIds: ["PLACEHOLDER-BLU"],
    sortOrder: 4,
  },
];

type SeedRule = {
  pattern: string;
  category: string;
  kind: "expense" | "income";
  matchField?: "merchant" | "description" | "raw_text";
  setType?: "income";
};

/** Starter rules (case-insensitive "contains"). Edit or remove them on the Categories & Rules page. */
export const seedRules: SeedRule[] = [
  { pattern: "snapp", category: "Transport & Taxi", kind: "expense" },
  { pattern: "اسنپ", category: "Transport & Taxi", kind: "expense" },
  { pattern: "tapsi", category: "Transport & Taxi", kind: "expense" },
  { pattern: "تپسی", category: "Transport & Taxi", kind: "expense" },
  { pattern: "taxi", category: "Transport & Taxi", kind: "expense" },
  { pattern: "تاکسی", category: "Transport & Taxi", kind: "expense" },
  { pattern: "digikala", category: "Shopping", kind: "expense" },
  { pattern: "دیجی کالا", category: "Shopping", kind: "expense" },
  { pattern: "همراه اول", category: "Mobile & Internet", kind: "expense" },
  { pattern: "ایرانسل", category: "Mobile & Internet", kind: "expense" },
  { pattern: "irancell", category: "Mobile & Internet", kind: "expense" },
  { pattern: "داروخانه", category: "Health & Pharmacy", kind: "expense" },
  { pattern: "سوپرمارکت", category: "Groceries", kind: "expense" },
  { pattern: "هایپر", category: "Groceries", kind: "expense" },
  { pattern: "کافه", category: "Dining & Cafe", kind: "expense" },
  { pattern: "رستوران", category: "Dining & Cafe", kind: "expense" },
  { pattern: "بنزین", category: "Fuel", kind: "expense" },
  { pattern: "جایگاه سوخت", category: "Fuel", kind: "expense" },
  { pattern: "حقوق", category: "Salary", kind: "income", matchField: "raw_text", setType: "income" },
  { pattern: "salary", category: "Salary", kind: "income", matchField: "description", setType: "income" },
];
