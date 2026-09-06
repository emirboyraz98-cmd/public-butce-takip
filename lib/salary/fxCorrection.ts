import Decimal from "decimal.js";

/**
 * Şirket, bordroyu sabit bir referans kur üzerinden TL'ye çevrilmiş gibi
 * işleyip gerçek ortalama kurla tekrar USD'ye çeviriyor:
 *   Ödenen USD = Nominal USD Toplamı × (Referans Kur / Ortalama Kur)
 */
export function applyFxCorrection(
  usdNominalTotal: Decimal | number | string,
  referenceRate: Decimal | number | string,
  avgUsdTryRate: Decimal | number | string
): Decimal {
  return new Decimal(usdNominalTotal).mul(
    new Decimal(referenceRate).div(new Decimal(avgUsdTryRate))
  );
}
