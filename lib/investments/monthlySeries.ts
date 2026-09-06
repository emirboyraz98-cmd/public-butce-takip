import Decimal from "decimal.js";

import { derivePositions, type TransactionLike } from "./positions";

export type MonthlyPoint = {
  month: string;
  /** O ay sonunda elde tutulanların toplam alış maliyeti (baz para birimi). */
  costBasis: number;
  /** O ay sonuna kadar satışlardan biriken gerçekleşen kâr/zarar. */
  realizedPL: number;
  /**
   * O ay sonundaki piyasa değeri. O aya ait fiyat verisi yoksa null —
   * bugünün fiyatını geçmişe uygulamak yanıltıcı olurdu.
   */
  marketValue: number | null;
  /** marketValue biliniyorsa: piyasa değeri − maliyet. */
  unrealizedPL: number | null;
  /** marketValue biliniyorsa: gerçekleşmemiş + gerçekleşen. */
  totalPL: number | null;
};

/** (symbol, assetType) için verilen ay sonunda geçerli fiyat; yoksa null. */
export type PriceLookup = (
  symbol: string,
  assetType: string,
  monthEnd: Date
) => { price: Decimal; currency: string } | null;

/** Tutarı baz para birimine çeviren fonksiyon. */
export type ToBase = (amount: Decimal, currency: string) => Decimal;

function endOfMonthUtc(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  // Bir sonraki ayın 0. günü = bu ayın son günü
  return new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
}

/**
 * Her ay sonu için portföyün durumunu, işlem defterinden yeniden kurarak
 * hesaplar. Maliyet ve gerçekleşen kâr/zarar tamamen işlemlerden türediği
 * için geriye dönük olarak kesindir; piyasa değeri ise yalnızca o aya ait
 * fiyat arşivi varsa hesaplanır.
 */
export function computeMonthlySeries({
  transactions,
  months,
  priceAt,
  toBase,
}: {
  transactions: TransactionLike[];
  months: string[];
  priceAt: PriceLookup;
  toBase: ToBase;
}): MonthlyPoint[] {
  return months.map((month) => {
    const monthEnd = endOfMonthUtc(month);

    // O ay sonuna kadar gerçekleşmiş işlemlerle pozisyonları yeniden kur.
    const upToMonth = transactions.filter((t) => t.tradedAt <= monthEnd);
    const positions = derivePositions(upToMonth);

    let costBasis = new Decimal(0);
    let realizedPL = new Decimal(0);
    let marketValue = new Decimal(0);
    let allPricesKnown = true;
    let hasOpenPosition = false;

    for (const p of positions) {
      realizedPL = realizedPL.plus(toBase(p.realizedPL, p.currency));

      if (p.quantity.lessThanOrEqualTo(0)) continue;
      hasOpenPosition = true;

      costBasis = costBasis.plus(
        toBase(p.quantity.mul(p.avgCostBasis), p.currency)
      );

      const priced = priceAt(p.symbol, p.assetType, monthEnd);
      if (!priced) {
        allPricesKnown = false;
        continue;
      }
      marketValue = marketValue.plus(
        toBase(p.quantity.mul(priced.price), priced.currency)
      );
    }

    // Tek bir sembolün bile fiyatı bilinmiyorsa toplam değer eksik kalır;
    // yarım bir rakam göstermektense o ayı boş bırakıyoruz.
    const valueKnown = hasOpenPosition ? allPricesKnown : true;
    const marketValueNum = valueKnown ? marketValue.toNumber() : null;

    return {
      month,
      costBasis: costBasis.toNumber(),
      realizedPL: realizedPL.toNumber(),
      marketValue: marketValueNum,
      unrealizedPL:
        marketValueNum === null ? null : marketValue.minus(costBasis).toNumber(),
      totalPL:
        marketValueNum === null
          ? null
          : marketValue.minus(costBasis).plus(realizedPL).toNumber(),
    };
  });
}
