import type { Metadata } from "next";
import { CategoriesView } from "@/components/categories/categories-view";
import { listCategoriesWithUsage, listRules } from "@/server/queries/categories";

export const metadata: Metadata = { title: "Categories & Rules" };

export default async function CategoriesPage() {
  const [categories, rules] = await Promise.all([listCategoriesWithUsage(), listRules()]);
  return <CategoriesView categories={categories} rules={rules} />;
}
