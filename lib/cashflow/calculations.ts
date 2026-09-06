import Decimal from "decimal.js";
import { format } from "date-fns";

export type Currency = "TRY" | "USD";

export type MoneyEntry = {
  amount: Decimal | number | string;
  currency: Currency;
  date: Date;
  frequency: "ONE_TIME" | "MONTHLY";
};

export type CurrencyTotals = Record<Currency, Decimal>;

/**
 * Bir kaydın, verilen ay için geçerli olup olmadığını belirler.
 * ONE_TIME: sadece kendi ayında geçerli.
 * MONTHLY: kendi ayından itibaren her ay tekrarlar (aylık tekrarlayan gider/gelir).
 */
export function appliesToMonth(entry: Pick<MoneyEntry, "date" | "frequency">, month: string): boolean {
  const entryMonth = format(entry.date, "yyyy-MM");
  if (entry.frequency === "ONE_TIME") return entryMonth === month;
  return entryMonth <= month;
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
