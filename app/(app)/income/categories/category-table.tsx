"use client";

import {
  CategoryManagerTable,
  type CategoryRow,
} from "@/components/money/category-manager-table";
import { deleteIncomeCategory } from "./actions";

export type { CategoryRow };

export function CategoryTable({ categories }: { categories: CategoryRow[] }) {
  return (
    <CategoryManagerTable
      categories={categories}
      onDelete={deleteIncomeCategory}
      entryNoun="gelir"
    />
  );
}
