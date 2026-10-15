import { db, sql } from "../src/db";
import { seedIfEmpty } from "../src/db/seed";

async function main() {
  const result = await seedIfEmpty(db());
  console.log(`Seeded: ${result.categories} categories, ${result.rules} rules, ${result.cards} cards.`);
  await sql().end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
