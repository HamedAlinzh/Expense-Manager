import { and, eq, sql } from "drizzle-orm";
import type { DB } from "./index";
import { cards, categories, categoryRules, settings } from "./schema";
import { seedCards, seedCategories, seedRules } from "./seed-data";

/**
 * Inserts defaults into empty tables only, so it is safe to run on every start.
 * Returns what was inserted for logging.
 */
export async function seedIfEmpty(db: DB): Promise<{ categories: number; cards: number; rules: number }> {
  return db.transaction(async (tx) => {
    const result = { categories: 0, cards: 0, rules: 0 };

    const [categoryCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(categories);
    if (categoryCount?.n === 0) {
      const rows = seedCategories.map((c, i) => ({ ...c, sortOrder: i }));
      result.categories = (await tx.insert(categories).values(rows).returning({ id: categories.id })).length;

      for (const [i, rule] of seedRules.entries()) {
        const [cat] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.name, rule.category), eq(categories.kind, rule.kind)));
        if (!cat) continue;
        await tx.insert(categoryRules).values({
          matchField: rule.matchField ?? "merchant",
          matchType: "contains",
          pattern: rule.pattern,
          categoryId: cat.id,
          setType: rule.setType,
          priority: 100 + i,
        });
        result.rules++;
      }
    }

    const [cardCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(cards);
    if (cardCount?.n === 0) {
      result.cards = (await tx.insert(cards).values(seedCards).returning({ id: cards.id })).length;
    }

    const [firstCard] = await tx.select({ id: cards.id }).from(cards).orderBy(cards.sortOrder, cards.id).limit(1);
    await tx
      .insert(settings)
      .values({ id: 1, defaultCardId: firstCard?.id ?? null })
      .onConflictDoNothing({ target: settings.id });

    return result;
  });
}
