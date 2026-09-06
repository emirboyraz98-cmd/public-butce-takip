"use client";

import {
  RecordList,
  type RecordFilter,
  type RecordRow,
} from "@/components/money/record-list";
import type {
  CategoryOption,
  RecordValues,
} from "@/components/money/record-dialog";
import { createIncomeEntry, deleteIncomeEntry, updateIncomeEntry } from "./actions";

/**
 * Filtre çipleri. Teslimat "Tümü / Maaş / Kira geliri / Diğer" diyor ama
 * kategori adları kullanıcıya ait ve sabitlenemez; bunun yerine tekrar
 * kipine göre süzülüyor — pratikte aynı ayrımı yapıyor, çünkü kira ve maaş
 * gibi düzenli gelirler aylık, prim ve satış gibi olanlar tek seferlik
 * giriliyor.
 */
const FILTERS: RecordFilter[] = [
  { value: "all", label: "Tümü", match: () => true },
  {
    value: "monthly",
    label: "Düzenli",
    match: (row) => row.frequency === "MONTHLY",
  },
  {
    value: "once",
    label: "Tek seferlik",
    match: (row) => row.frequency === "ONE_TIME",
  },
];

function toFormData(values: RecordValues): FormData {
  const fd = new FormData();
  fd.set("categoryId", values.categoryId);
  fd.set("amount", values.amount);
  fd.set("currency", values.currency);
  if (values.note) fd.set("note", values.note);
  fd.set("date", values.date);
  fd.set("frequency", values.frequency);
  return fd;
}

export function IncomeList({
  rows,
  categories,
  baseCurrency,
}: {
  rows: RecordRow[];
  categories: CategoryOption[];
  baseCurrency: string;
}) {
  return (
    <RecordList
      rows={rows}
      categories={categories}
      filters={FILTERS}
      baseCurrency={baseCurrency}
      addLabel="Gelir ekle"
      defaultKind="income"
      csvHref="/api/export?format=csv&scope=income"
      emptyMessage="Henüz bir gelir kaydı eklenmedi."
      onCreate={(values) => createIncomeEntry({}, toFormData(values))}
      onUpdate={(values) => {
        const fd = toFormData(values);
        fd.set("id", values.id ?? "");
        return updateIncomeEntry({}, fd);
      }}
      onDelete={deleteIncomeEntry}
    />
  );
}
