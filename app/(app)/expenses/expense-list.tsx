"use client";

import {
  RecordList,
  type RecordFilter,
  type RecordRow,
} from "@/components/money/record-list";
import type {
  CategoryOption,
  RecordKind,
  RecordValues,
} from "@/components/money/record-dialog";
import { createExpense, deleteExpense, updateExpense } from "./actions";

/**
 * Teslimattaki ödeme türü çipleri. Krediler ayrı bir sekmede duruyor:
 * kredi tek tek kayıt değil, dönem + taksit tutarı olarak saklanan bir
 * takvim — bu listenin satır yapısına girmiyor.
 */
const FILTERS: RecordFilter[] = [
  { value: "all", label: "Tümü", match: () => true },
  { value: "card", label: "Kredi kartı", match: (row) => row.kind === "card" },
  { value: "cash", label: "Nakit · havale", match: (row) => row.kind === "cash" },
];

function toFormData(values: RecordValues, kind: RecordKind): FormData {
  const fd = new FormData();
  fd.set("categoryId", values.categoryId);
  fd.set("amount", values.amount);
  fd.set("currency", values.currency);
  if (values.note) fd.set("note", values.note);
  fd.set("date", values.date);
  fd.set("frequency", values.frequency);
  fd.set("kind", kind === "card" ? "CREDIT_CARD" : "OTHER");
  if (kind === "card") {
    fd.set("paymentMonth", values.paymentMonth);
    fd.set("installmentCount", String(values.installmentCount));
  }
  return fd;
}

export function ExpenseList({
  rows,
  categories,
  baseCurrency,
  statementOffset,
  extraActions,
}: {
  rows: RecordRow[];
  categories: CategoryOption[];
  baseCurrency: string;
  statementOffset: number;
  extraActions?: React.ReactNode;
}) {
  return (
    <RecordList
      rows={rows}
      categories={categories}
      filters={FILTERS}
      baseCurrency={baseCurrency}
      addLabel="Gider ekle"
      defaultKind="card"
      kindSwitchable
      statementOffset={statementOffset}
      csvHref="/api/export?format=csv&scope=expenses"
      emptyMessage="Henüz bir gider kaydı eklenmedi."
      extraActions={extraActions}
      onCreate={(values, kind) => createExpense({}, toFormData(values, kind))}
      onUpdate={(values, kind) => {
        const fd = toFormData(values, kind);
        fd.set("id", values.id ?? "");
        return updateExpense({}, fd);
      }}
      onDelete={deleteExpense}
    />
  );
}
