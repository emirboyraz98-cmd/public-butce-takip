import {
  installmentSchedule,
  type LoanScheduleInput,
} from "@/lib/loans/schedule";
import { monthOf } from "@/lib/expenses/creditCard";
import { formatCsvNumber } from "./csv";

export const MONEY_CSV_HEADERS = [
  "Tür",
  "Tarih",
  "Ay",
  "Kategori",
  "Tutar",
  "Para Birimi",
  "Tekrar",
  "Ödeme Ayı",
  "Taksit",
  "Not",
];

export type ExportEntry = {
  /** yyyy-MM-dd */
  date: string;
  categoryName: string;
  amount: string;
  currency: string;
  frequency: "ONE_TIME" | "MONTHLY";
  note: string | null;
};

export type ExportExpense = ExportEntry & {
  kind: "OTHER" | "CREDIT_CARD";
  paymentMonth: string | null;
  installmentCount: number;
};

export type ExportLoan = LoanScheduleInput & { paidMonths: string[] };

function row(values: (string | null)[]): string[] {
  return values.map((v) => v ?? "");
}

/**
 * Gelir, gider ve kredi taksitlerini Excel'de incelenebilecek tek düz
 * tabloya indirger.
 *
 * Krediler kayıt kayıt tutulmadığı için (dönem + taksit tutarı olarak
 * saklanıyorlar) takvimleri burada aya yayılır; kullanıcı tabloda uygulamada
 * gördüğü taksitlerin aynısını görsün. Süresiz kredilerin takvimi sonsuz
 * olduğundan tek satırla, tutarı boş bırakılarak belirtilir.
 */
export function buildMoneyRows({
  incomes,
  expenses,
  loans,
  asOfMonth,
}: {
  incomes: ExportEntry[];
  expenses: ExportExpense[];
  loans: ExportLoan[];
  asOfMonth: string;
}): string[][] {
  const rows: string[][] = [];

  for (const e of incomes) {
    rows.push(
      row([
        "Gelir",
        e.date,
        monthOf(e.date),
        e.categoryName,
        formatCsvNumber(e.amount),
        e.currency,
        e.frequency === "MONTHLY" ? "Aylık" : "Tek seferlik",
        null,
        null,
        e.note,
      ])
    );
  }

  for (const e of expenses) {
    rows.push(
      row([
        e.kind === "CREDIT_CARD" ? "Kredi Kartı" : "Gider",
        e.date,
        monthOf(e.date),
        e.categoryName,
        formatCsvNumber(e.amount),
        e.currency,
        e.frequency === "MONTHLY" ? "Aylık" : "Tek seferlik",
        e.paymentMonth,
        e.installmentCount > 1 ? String(e.installmentCount) : null,
        e.note,
      ])
    );
  }

  for (const loan of loans) {
    const schedule = installmentSchedule(loan, asOfMonth, loan.paidMonths);

    if (schedule.length === 0) {
      rows.push(
        row([
          "Kredi Taksiti",
          null,
          loan.startMonth,
          loan.name,
          null,
          loan.currency,
          "Aylık",
          null,
          null,
          "Süresiz kredi — bitiş ayı girilmedi",
        ])
      );
      continue;
    }

    for (const item of schedule) {
      rows.push(
        row([
          "Kredi Taksiti",
          null,
          item.month,
          loan.name,
          formatCsvNumber(item.amount.toFixed(2)),
          loan.currency,
          "Aylık",
          item.month,
          null,
          item.paid ? "Ödendi olarak işaretli" : null,
        ])
      );
    }
  }

  // Ay sütununa göre sıralı çıksın; Excel'de ilk açılışta anlamlı olsun.
  return rows.sort((a, b) => a[2].localeCompare(b[2]));
}
