"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";

import { cn } from "@/lib/utils";
import { formatMoney, formatMonth } from "@/lib/format";
import { cardLimitStatus } from "@/lib/expenses/cardLimit";
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
  monthlyLimit,
  spentBaseByMonth,
  baseCurrency,
}: {
  entries: CardEntry[];
  months: string[];
  /** Ay -> para birimi -> ekstre defterindeki GERÇEK ödeme. */
  paidByMonth: Record<string, Record<string, string>>;
  /** Genelde içinde bulunulan ay; taksitler listeyi ileriye uzattığı için
      en yeni ay varsayılan olamıyor. */
  defaultMonth: string;
  /** Aylık harcama sınırı (baz para birimi); null = sınır konmamış. */
  monthlyLimit: string | null;
  /** Ay -> o ayın kart harcamasının baz para birimi karşılığı. */
  spentBaseByMonth: Record<string, string>;
  baseCurrency: string;
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

  /*
   * Sınır tek bir sayı, harcama ise para birimi başına ayrı tutuluyor;
   * karşılaştırma sunucuda çevrilmiş baz tutarla yapılıyor. Sınır yoksa
   * bölüm hiç çizilmiyor — boş bir çubuk göstermek, sınır konmuş ama
   * sıfırlanmış gibi okunurdu.
   */
  const limitStatus =
    monthlyLimit === null
      ? null
      : cardLimitStatus(monthlyLimit, spentBaseByMonth[month] ?? "0");

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

      {limitStatus && (
        <div
          className={cn(
            "border p-4",
            limitStatus.over ? "border-destructive" : "border-border"
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-muted-foreground text-sm">
              {formatMonth(month)} limit kullanımı
            </p>
            <p className="text-[13px] font-semibold tabular-nums">
              {formatMoney(limitStatus.spent.toString(), baseCurrency)}
              <span className="text-muted-foreground font-normal">
                {" / "}
                {formatMoney(limitStatus.limit.toString(), baseCurrency)}
              </span>
            </p>
          </div>

          {/*
            Çubuk genişliği %100'de kırpılı: %180'lik bir aşımda kutudan
            taşıyordu. Aşımın büyüklüğü altta tutar olarak yazıyor, o yüzden
            bilgi kaybı yok.
          */}
          <div
            className="bg-muted mt-2 h-2.5 w-full"
            role="progressbar"
            aria-valuenow={Math.round(limitStatus.rawPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${formatMonth(month)} kart limiti kullanımı`}
          >
            <div
              className={cn(
                "h-full",
                limitStatus.over
                  ? "bg-destructive"
                  : limitStatus.nearLimit
                    ? "bg-primary"
                    : "bg-foreground"
              )}
              style={{ width: `${limitStatus.percent}%` }}
            />
          </div>

          <p
            className={cn(
              "mt-2 text-xs",
              limitStatus.over
                ? "text-destructive font-semibold"
                : "text-muted-foreground"
            )}
          >
            {limitStatus.over ? (
              <>
                Sınır{" "}
                {formatMoney(limitStatus.overage.toString(), baseCurrency)}{" "}
                aşıldı (%{Math.round(limitStatus.rawPercent)}).
              </>
            ) : (
              <>
                {formatMoney(limitStatus.remaining.toString(), baseCurrency)}{" "}
                kaldı (%{Math.round(limitStatus.rawPercent)} kullanıldı).
                {limitStatus.nearLimit && (
                  <strong className="text-foreground"> Sınıra yaklaştın.</strong>
                )}
              </>
            )}
          </p>
        </div>
      )}
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
