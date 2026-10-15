import { createElement } from "react";
import { cn } from "cn";
import { categoryIcon } from "@/lib/category-icons";

export type CategoryLite = {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income";
  parentId: number | null;
  archived?: boolean;
};

export function CategoryDot({
  category,
  size = "md",
}: {
  category: Pick<CategoryLite, "icon" | "color">;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "sm" ? "size-5 rounded-md" : size === "lg" ? "size-10 rounded-xl" : "size-7 rounded-lg";
  const icon = size === "sm" ? "size-3" : size === "lg" ? "size-5" : "size-3.5";
  return (
    <span
      className={cn("grid shrink-0 place-items-center", box)}
      style={{ backgroundColor: `${category.color}22`, color: category.color }}
    >
      {createElement(categoryIcon(category.icon), { className: icon, "aria-hidden": true })}
    </span>
  );
}

export function CategoryBadge({
  category,
  className,
}: {
  category: CategoryLite | null | undefined;
  className?: string;
}) {
  if (!category) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground italic", className)}>
        Uncategorized
      </span>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-sm", className)}>
      <CategoryDot category={category} size="sm" />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
