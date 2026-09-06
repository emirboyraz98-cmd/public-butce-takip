"use client";

import {
  CategoryManagerTable,
  type CategoryRow,
} from "@/components/money/category-manager-table";
import {
  deleteExpenseCategory,
  setExpenseCategoryArchived,
} from "./actions";
import { CategoryLimitCell } from "@/app/(app)/settings/category-limit-cell";

export type { CategoryRow };

/** Kategori kimliği -> aylık limit (null = sınır yok). */
export type LimitMap = Record<string, string | null>;

export function CategoryTable({
  categories,
  limits,
  currency,
}: {
  categories: CategoryRow[];
  /**
   * Verilirse tabloya "Aylık limit" sütunu eklenir. Yalnızca birleşik
   * Ayarlar ekranında geçiliyor; başka yerde sütun gereksiz genişlik.
   */
  limits?: LimitMap;
  currency?: string;
}) {
  return (
    <CategoryManagerTable
      categories={categories}
      onDelete={deleteExpenseCategory}
      onToggleArchive={setExpenseCategoryArchived}
      entryNoun="harcama"
      limitCell={
        limits
          ? (id) => (
              <CategoryLimitCell
                categoryId={id}
                limit={limits[id] ?? null}
                currency={currency ?? "TRY"}
              />
            )
          : undefined
      }
    />
  );
}
