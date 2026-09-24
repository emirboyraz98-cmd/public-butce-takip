import Decimal from "decimal.js";
import { toMonthKeyUtc } from "@/lib/date/utc";

export type Currency = "TRY" | "USD";

export type MoneyEntry = {
  amount: Decimal | number | string;
  currency: Currency;
  date: Date;
  frequency: "ONE_TIME" | "MONTHLY";
  /**
   * Tekrarlayan kaydın son ayı (yyyy-MM), o ay DAHİL. `null`/tanımsız =
   * hâlâ sürüyor. Yalnızca MONTHLY için anlamlı.
   */
  recurrenceEndMonth?: string | null;
};

export type CurrencyTotals = Record<Currency, Decimal>;

/**
 * Bir kaydın, verilen ay için geçerli olup olmadığını belirler.
 *
 * ONE_TIME: sadece kendi ayında geçerli.
 * MONTHLY: kendi ayından `recurrenceEndMonth`'a kadar (o ay dahil) her ay.
 * Bitiş ayı yoksa süresiz tekrarlar.
 *
 * Bitiş ayı, tekrarı geçmişi bozmadan sonlandırmanın tek yolu: eskiden
 * kaydı silmek gerekiyordu, o da ödenmiş ayları da kayıttan düşürüyordu.
 *
 * Tek boğaz noktası: Genel Bakış, Bütçeler, Raporlar ve aylık toplamların
 * hepsi buradan geçiyor, yani kural tek yerde duruyor.
 */
export function appliesToMonth(
  entry: Pick<MoneyEntry, "date" | "frequency" | "recurrenceEndMonth">,
  month: string
): boolean {
  const entryMonth = toMonthKeyUtc(entry.date);
  if (entry.frequency === "ONE_TIME") return entryMonth === month;
  if (entryMonth > month) return false;
  const end = entry.recurrenceEndMonth;
  return !end || month <= end;
}

export function sumByCurrency(entries: MoneyEntry[], month: string): CurrencyTotals {
  const totals: CurrencyTotals = { TRY: new Decimal(0), USD: new Decimal(0) };

  for (const entry of entries) {
    if (!appliesToMonth(entry, month)) continue;
    totals[entry.currency] = totals[entry.currency].plus(new Decimal(entry.amount));
  }

  return totals;
}

export type MonthlyCashflow = {
  month: string;
  income: CurrencyTotals;
  expenses: CurrencyTotals;
  net: CurrencyTotals;
};

export function computeMonthlyCashflow(
  incomeEntries: MoneyEntry[],
  expenseEntries: MoneyEntry[],
  month: string
): MonthlyCashflow {
  const income = sumByCurrency(incomeEntries, month);
  const expenses = sumByCurrency(expenseEntries, month);

  return {
    month,
    income,
    expenses,
    net: {
      TRY: income.TRY.minus(expenses.TRY),
      USD: income.USD.minus(expenses.USD),
    },
  };
}
