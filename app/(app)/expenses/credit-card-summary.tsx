"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";

import { formatMoney, formatMonth } from "@/lib/format";
import {
  appliesToSpendMonth,
  installmentMonths,
  monthOf,
} from "@/lib/expenses/creditCard";

export type CardEntry = {
  /** yyyy-MM-dd */
  date: string;
  /** yyyy-MM */
  paymentMonth: string | null;
  amount: number;
  currency: string;
  frequency: "ONE_TIME" | "MONTHLY";
  /** 1 = tek çekim. Taksitli harcamada tutar aylara bölünür. */
  installmentCount: number;
};

/**
 * Seçilen ay için iki ayrı sayıyı yan yana gösterir:
 *
 * - **O ay harcanan**: alışkanlık analizi. "Temmuzda ne kadar harcadım."
 * - **O ay ödenecek**: nakit akışı. Temmuz ekstresi ağustosta ödendiği için
 *   bu iki sayı normalde farklıdır; karıştırılırsa bütçe yanlış okunur.
 */
export function CreditCardSummary({
  entries,
  months,
  paidByMonth,
  defaultMonth,
}: {
  entries: CardEntry[];
  months: string[];
  /** Ay -> para birimi -> ekstre defterindeki GERÇEK ödeme. */
  paidByMonth: Record<string, Record<string, string>>;
  /** Genelde içinde bulunulan ay; taksitler listeyi ileriye uzattığı için
      en yeni ay varsayılan olamıyor. */
  defaultMonth: string;
}) {
  const [month, setMonth] = useState(
    months.includes(defaultMonth) ? defaultMonth : (months[0] ?? "")
  );

  const { spent, due, dueMonth } = useMemo(() => {
    const spentTotals = new Map<string, Decimal>();

    for (const entry of entries) {
      const amount = new Decimal(entry.amount);
      if (appliesToSpendMonth(entry, month)) {
        spentTotals.set(
          entry.currency,
          (spentTotals.get(entry.currency) ?? new Decimal(0)).plus(amount)
        );
      }
    }

    // "Ödenen" ekstre defterinden gelir: asgari ödeme yapıldıysa kayıtlı
    // harcamaların toplamı değil, gerçekten cepten çıkan tutar budur.
    const dueTotals = new Map<string, Decimal>(
      Object.entries(paidByMonth[month] ?? {}).map(([currency, amount]) => [
        currency,
        new Decimal(amount),
      ])
    );

    // Bu ay harcananların hangi ay(lar)da ödeneceğini göstermek için, o ayın
    // kayıtlarından ilkini örnek alırız. Taksitliyse ilk ve son taksit ayı
    // birlikte yazılır.
    const sample = entries.find((e) => appliesToSpendMonth(e, month));
    let dueMonth: string | null = null;
    if (sample) {
      const months = installmentMonths(sample);
      dueMonth =
        months.length > 1
          ? `${months[0]} – ${months[months.length - 1]}`
          : (sample.paymentMonth ?? monthOf(sample.date));
    }

    return { spent: spentTotals, due: dueTotals, dueMonth };
  }, [entries, month, paidByMonth]);

  if (months.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cc-summary-month" className="text-sm font-medium">
          Ay
        </label>
        <select
          id="cc-summary-month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border-input bg-muted h-9 border px-2 text-sm"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className=" border p-4">
          <p className="text-muted-foreground text-sm">
            {formatMonth(month)} harcaması
            {dueMonth && dueMonth !== month && (
              <span className="text-muted-foreground">
                {" "}
                — {formatMonth(dueMonth)} ekstresinde ödenecek
              </span>
            )}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            <Totals totals={spent} />
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Bu ay kartla yapılan harcamalar. Alışkanlık analizi için.
          </p>
        </div>

        <div className=" border p-4">
          <p className="text-muted-foreground text-sm">
            {formatMonth(month)} ödemesi
          </p>
          <p className="mt-1 text-2xl font-semibold">
            <Totals totals={due} />
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Bu ay cebinden çıkan tutar — ekstre defterindeki ödeme. Genel Bakış
            bunu kullanır.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Para birimleri karıştırılmadan yan yana yazılır. */
function Totals({ totals }: { totals: Map<string, Decimal> }) {
  const parts = [...totals.entries()].filter(([, value]) => !value.isZero());
  if (parts.length === 0) return <>—</>;

  return (
    <>
      {parts.map(([currency, value], index) => (
        <span key={currency}>
          {index > 0 && <span className="text-muted-foreground"> + </span>}
          {formatMoney(value.toString(), currency)}
        </span>
      ))}
    </>
  );
}
