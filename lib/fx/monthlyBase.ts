import Decimal from "decimal.js";

import { convert } from "./convert";
import {
  getMonthlyAverageRates,
  rateForMonthWithFallback,
} from "./monthlyAverage";

export type ToBaseForMonth = (
  amount: Decimal,
  currency: string,
  month: string
) => Decimal;

/**
 * Aylık tutarları baz para birimine çeviren fonksiyonu hazırlar.
 *
 * Çevrim, tutarın AİT OLDUĞU ayın TCMB ortalama kuruyla yapılır; bugünkü
 * kurla çevirmek kur yükseldikçe geçmiş ayları da olduğundan büyük
 * gösterirdi. O aya ait kur yoksa en yakın önceki ayın kuruna düşülür,
 * hiç yoksa güncel kur kullanılır.
 *
 * Gelir, gider ve Genel Bakış aynı işi yaptığından tek yerde toplanır:
 * ayrı ayrı yazıldığında aynı kayıt iki sayfada farklı tutarda görünebilir.
 */
export async function createMonthlyBaseConverter({
  months,
  baseCurrency,
}: {
  months: readonly string[];
  baseCurrency: string;
}): Promise<ToBaseForMonth> {
  const monthlyRates = await getMonthlyAverageRates([...new Set(months)]);

  // Kur kaynağına hiç ulaşılamazsa sayfayı çökertmek yerine 1'e düşülür;
  // tutarlar karışık olur ama sayfa açılır.
  const currentUsdTry = await convert(1, "USD", "TRY").catch(
    () => new Decimal(1)
  );
  const fallback =
    baseCurrency === "TRY" ? currentUsdTry : new Decimal(1).div(currentUsdTry);

  return function toBaseForMonth(amount, currency, month) {
    if (currency === baseCurrency) return amount;

    const { rate: usdTry } = rateForMonthWithFallback(
      month,
      monthlyRates,
      fallback
    );

    // usdTry: 1 USD kaç TRY
    if (currency === "USD" && baseCurrency === "TRY") return amount.mul(usdTry);
    if (currency === "TRY" && baseCurrency === "USD") return amount.div(usdTry);
    return amount; // desteklenmeyen para birimi: dönüştürmeden bırak
  };
}
