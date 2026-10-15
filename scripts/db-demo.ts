/**
 * Development helper: fills the database with ~4 Jalali months of realistic demo
 * transactions (all tagged "demo") so dashboards and reports have data to show.
 *
 *   npm run db:demo            insert demo data (idempotent: removes previous demo data first)
 *   npm run db:demo -- --remove   delete all demo data
 *
 * Refuses to run when NODE_ENV=production.
 */
import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, sql } from "../src/db";
import { budgets, cards, categories, transactions } from "../src/db/schema";
import { txFingerprint } from "../src/lib/dedupe";
import { addJalaliMonths, jalaliMonthLength } from "../src/lib/format/jalali";
import { currentJalaliMonth, jalaliToUtc, toJalaliParts } from "../src/lib/format/time";

const DEMO_TAG = "demo";
/** Demo budgets use this sentinel start month so --remove can find them. */
const DEMO_BUDGET_MONTH = "1400-01";

// Deterministic PRNG so every run produces the same data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1405);
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
/** Toman amount rounded to a "real-looking" value, returned in Rial. */
const toman = (min: number, max: number, step = 1000) => Math.round(between(min, max) / step) * step * 10;

async function removeDemo() {
  const d = db();
  const removed = await d
    .delete(transactions)
    .where(dsql`${DEMO_TAG} = any(${transactions.tags})`)
    .returning({ id: transactions.id });
  const b = await d.delete(budgets).where(eq(budgets.startsMonth, DEMO_BUDGET_MONTH)).returning({ id: budgets.id });
  console.log(`Removed ${removed.length} demo transactions and ${b.length} demo budgets.`);
}

type Spec = {
  category: string;
  card: string;
  desc: string[];
  perMonth: [number, number];
  amount: [number, number];
  step?: number;
};

const EXPENSES: Spec[] = [
  {
    category: "Groceries",
    card: "Blu",
    desc: ["سوپرمارکت", "هایپراستار", "Refah", "میوه فروشی"],
    perMonth: [7, 11],
    amount: [180_000, 1_600_000],
    step: 5000,
  },
  {
    category: "Dining & Cafe",
    card: "Tejarat",
    desc: ["کافه لمیز", "Lamiz Coffee", "رستوران شاندیز", "Pizza", "ناهار"],
    perMonth: [8, 14],
    amount: [120_000, 900_000],
    step: 5000,
  },
  {
    category: "Transport & Taxi",
    card: "Mellat",
    desc: ["Snapp", "اسنپ", "Tapsi", "تپسی"],
    perMonth: [14, 22],
    amount: [60_000, 380_000],
  },
  {
    category: "Fuel",
    card: "Mellat",
    desc: ["جایگاه سوخت", "بنزین"],
    perMonth: [2, 3],
    amount: [350_000, 700_000],
    step: 5000,
  },
  {
    category: "Shopping",
    card: "Blu",
    desc: ["Digikala", "دیجی کالا", "Zara", "کفش ملی"],
    perMonth: [1, 4],
    amount: [400_000, 4_500_000],
    step: 10_000,
  },
  {
    category: "Health & Pharmacy",
    card: "Sepah",
    desc: ["داروخانه", "دکتر", "آزمایشگاه"],
    perMonth: [0, 2],
    amount: [150_000, 1_800_000],
    step: 5000,
  },
  {
    category: "Entertainment",
    card: "Tejarat",
    desc: ["سینما", "Concert", "بازی"],
    perMonth: [0, 3],
    amount: [200_000, 1_200_000],
    step: 10_000,
  },
  {
    category: "Gifts",
    card: "Blu",
    desc: ["کادو تولد", "Gift"],
    perMonth: [0, 1],
    amount: [500_000, 3_000_000],
    step: 10_000,
  },
];

const FIXED: {
  category: string;
  card: string;
  desc: string;
  day: number;
  amount: number;
  type: "expense" | "income";
}[] = [
  { category: "Salary", card: "Sepah", desc: "حقوق ماهانه", day: 1, amount: 48_000_000, type: "income" },
  { category: "Rent", card: "Sepah", desc: "اجاره خانه", day: 3, amount: 16_000_000, type: "expense" },
  { category: "Mobile & Internet", card: "Mellat", desc: "Irancell", day: 6, amount: 290_000, type: "expense" },
  { category: "Bills & Utilities", card: "Mellat", desc: "قبض برق و گاز", day: 12, amount: 640_000, type: "expense" },
  { category: "Subscriptions", card: "Blu", desc: "Filimo", day: 9, amount: 129_000, type: "expense" },
  { category: "Subscriptions", card: "Blu", desc: "Spotify", day: 18, amount: 210_000, type: "expense" },
];

async function insertDemo() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to insert demo data in production");
  await removeDemo();
  const d = db();
  const cardRows = await d.select().from(cards);
  const catRows = await d.select().from(categories);
  const cardId = (name: string) => cardRows.find((c) => c.name === name)?.id ?? cardRows[0]?.id ?? null;
  const catId = (name: string) => catRows.find((c) => c.name === name)?.id ?? null;

  const now = new Date();
  const today = toJalaliParts(now);
  const cur = currentJalaliMonth(now);
  const rows: (typeof transactions.$inferInsert)[] = [];

  for (let back = 3; back >= 0; back--) {
    const { jy, jm } = addJalaliMonths(cur.jy, cur.jm, -back);
    const lastDay = back === 0 ? today.jd : jalaliMonthLength(jy, jm);
    const at = (day: number) =>
      jalaliToUtc({
        jy,
        jm,
        jd: Math.min(Math.max(1, day), lastDay),
        hour: Math.floor(between(8, 23)),
        minute: Math.floor(between(0, 59)),
      });
    const add = (r: {
      type: "expense" | "income";
      amount: number;
      occurredAt: Date;
      desc: string;
      card: string;
      category: string;
    }) => {
      if (r.occurredAt > now) return;
      const cId = cardId(r.card);
      const direction = r.type === "expense" ? "out" : "in";
      rows.push({
        type: r.type,
        direction,
        amountRial: r.amount,
        occurredAt: r.occurredAt,
        description: r.desc,
        cardId: cId,
        categoryId: catId(r.category),
        tags: [DEMO_TAG],
        source: pick(["manual", "sms", "sms", "telegram"] as const),
        status: rand() < 0.04 ? "pending_review" : "confirmed",
        dedupeHash: txFingerprint(cId, direction, r.amount, r.occurredAt),
      });
    };

    for (const f of FIXED) {
      if (f.day > lastDay) continue;
      // Spotify gets a price increase in the latest month (for later recurring-detection demos).
      const amount = f.desc === "Spotify" && back === 0 ? 240_000 : f.amount;
      add({
        type: f.type,
        amount: amount * 10,
        occurredAt: at(f.day),
        desc: f.desc,
        card: f.card,
        category: f.category,
      });
    }
    for (const s of EXPENSES) {
      const fraction = lastDay / jalaliMonthLength(jy, jm);
      const n = Math.round(between(s.perMonth[0], s.perMonth[1]) * fraction);
      for (let i = 0; i < n; i++) {
        add({
          type: "expense",
          amount: toman(s.amount[0], s.amount[1], s.step),
          occurredAt: at(Math.ceil(rand() * lastDay)),
          desc: pick(s.desc),
          card: s.card,
          category: s.category,
        });
      }
    }
    if (rand() < 0.6 && lastDay >= 15) {
      add({
        type: "income",
        amount: toman(3_000_000, 12_000_000, 100_000),
        occurredAt: at(Math.ceil(between(10, lastDay))),
        desc: "پروژه فریلنس",
        card: "Tejarat",
        category: "Freelance",
      });
    }
  }

  // Monthly top-up transfer Mellat → Blu.
  const transferPairs: { out: typeof transactions.$inferInsert; in: typeof transactions.$inferInsert }[] = [];
  for (let back = 3; back >= 0; back--) {
    const { jy, jm } = addJalaliMonths(cur.jy, cur.jm, -back);
    const day = 2;
    if (back === 0 && today.jd < day) continue;
    const occurredAt = jalaliToUtc({ jy, jm, jd: day, hour: 10, minute: 15 });
    const amount = 5_000_000 * 10;
    const base = {
      type: "transfer" as const,
      amountRial: amount,
      occurredAt,
      description: "Top up Blu",
      tags: [DEMO_TAG],
      source: "manual" as const,
      status: "confirmed" as const,
    };
    transferPairs.push({
      out: { ...base, direction: "out", cardId: cardId("Mellat") },
      in: { ...base, direction: "in", cardId: cardId("Blu") },
    });
  }

  await d.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 200) await tx.insert(transactions).values(rows.slice(i, i + 200));
    for (const p of transferPairs) {
      const [o] = await tx.insert(transactions).values(p.out).returning({ id: transactions.id });
      const [n] = await tx
        .insert(transactions)
        .values({ ...p.in, linkedTransactionId: o!.id })
        .returning({ id: transactions.id });
      await tx.update(transactions).set({ linkedTransactionId: n!.id }).where(eq(transactions.id, o!.id));
    }
    const demoBudgets = [
      ["Groceries", 9_000_000],
      ["Dining & Cafe", 5_000_000],
      ["Transport & Taxi", 3_000_000],
      ["Shopping", 6_000_000],
    ] as const;
    for (const [name, limit] of demoBudgets) {
      const id = catId(name);
      if (!id) continue;
      const existing = await tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(and(eq(budgets.categoryId, id), inArray(budgets.startsMonth, [DEMO_BUDGET_MONTH])));
      if (existing.length === 0)
        await tx.insert(budgets).values({ categoryId: id, amountRial: limit * 10, startsMonth: DEMO_BUDGET_MONTH });
    }
  });
  console.log(
    `Inserted ${rows.length} demo transactions, ${transferPairs.length} transfers and demo budgets. Remove with: npm run db:demo -- --remove`,
  );
}

async function main() {
  if (process.argv.includes("--remove")) await removeDemo();
  else await insertDemo();
  await sql().end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
