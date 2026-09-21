import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { convert } from "./convert";

/** Tarihi bilinen tek bir tutarı baz para birimine çevirir. */
export type ToBaseOnDate = (
  amount: Decimal,
  currency: string,
  date: Date
) => Decimal;

export type DailyRate = { date: Date; usdTry: Decimal };

export type RateSource = "exact" | "earlier" | "later" | "fallback";

/**
 * Bir GÜNÜN USD/TRY kurunu arşivden seçer.
 *
 * Aylık ortalamadan (bkz. monthlyAverage) ayrı bir işi var: maaş ya da gider
 * gibi aya yayılan tutarlar için ortalama doğru, ama tek bir güne çakılı
 * olaylar — bir hisse satışı — o günün kuruyla çevrilmeli.
 *
 * Sıra: o günün kuru → en yakın ÖNCEKİ gün → en yakın SONRAKİ gün →
 * fallback. Önceki gün öne alınıyor çünkü TCMB hafta sonu ve tatillerde kur
 * yayımlamaz; cumartesi yapılan bir satışın doğru karşılığı cumanın
 * kurudur. Sonraki gün yalnızca işlem arşivden eskiyse devreye girer:
 * yıllar sonrasının kuru yerine arşivin en eski günü yine de daha yakındır.
 */
export function rateForDate(
  date: Date,
  /** Tarihe göre ARTAN sıralı arşiv. */
  archive: DailyRate[],
  fallback: Decimal
): { usdTry: Decimal; source: RateSource } {
  if (archive.length === 0) return { usdTry: fallback, source: "fallback" };

  const target = date.getTime();
  let earlier: DailyRate | null = null;

  for (const row of archive) {
    const rowTime = row.date.getTime();
    if (rowTime === target) return { usdTry: row.usdTry, source: "exact" };
    if (rowTime < target) earlier = row;
    else break;
  }

  if (earlier) return { usdTry: earlier.usdTry, source: "earlier" };
  return { usdTry: archive[0].usdTry, source: "later" };
}

/**
 * Tarihli tutarları baz para birimine çeviren fonksiyonu hazırlar.
 *
 * Arşiv yalnızca OKUNUR; eksik günler burada TCMB'den çekilmez. Doldurma
 * işi cron görevinde (bkz. api/cron/refresh-prices) ve maaş hesabında;
 * sayfa render'ının içine ağ isteği koymak, arşivi boş bir kurulumda ilk
 * açılışı onlarca isteğe bağlardı.
 */
export async function createDailyBaseConverter({
  baseCurrency,
  since,
}: {
  baseCurrency: string;
  /** Bu tarihten eski kurlar hiç okunmaz. Verilmezse arşivin tamamı. */
  since?: Date;
}): Promise<ToBaseOnDate> {
  const rows = await prisma.tcmbRateSnapshot.findMany({
    where: since ? { date: { gte: since } } : undefined,
    orderBy: { date: "asc" },
    select: { date: true, usdSale: true },
  });

  const archive: DailyRate[] = rows.map((r) => ({
    date: r.date,
    usdTry: new Decimal(r.usdSale.toString()),
  }));

  // Arşiv bambaşka boşsa sayfayı çökertmek yerine güncel kura düşülür.
  const fallback = await convert(1, "USD", "TRY").catch(() => new Decimal(1));

  return function toBaseOnDate(amount, currency, date) {
    if (currency === baseCurrency) return amount;

    const { usdTry } = rateForDate(date, archive, fallback);

    if (currency === "USD" && baseCurrency === "TRY") return amount.mul(usdTry);
    if (currency === "TRY" && baseCurrency === "USD") return amount.div(usdTry);
    return amount; // desteklenmeyen para birimi: dönüştürmeden bırak
  };
}
