import Decimal from "decimal.js";

/**
 * Maaşın hak ediş ayı ile nakit ayı arasındaki kaymayı yönetir.
 *
 * Maaş, çalışıldığı ayın karşılığıdır ama genelde sonraki ay ödenir
 * (örn. temmuz maaşı 12 ağustosta yatar). Maaş sekmesi hak edişi gösterir;
 * Genel Bakış ise nakit akışını gösterdiği için maaşı ödendiği aya taşır.
 */

/** yyyy-MM biçimindeki bir aya ay ekler/çıkarır. */
export function shiftMonth(month: string, offset: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  // Date.UTC ay taşmasını kendisi çözer (13. ay -> sonraki yılın ocağı).
  const shifted = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}`;
}

/**
 * Nakit akışında `cashMonth` ayında görünecek maaş, hangi hak ediş ayına
 * aittir? Ödeme `offset` ay geciktiği için geriye gidilir.
 *
 * offset 1 iken: ağustos sütununda temmuzun maaşı görünür.
 */
export function accrualMonthForCashMonth(
  cashMonth: string,
  offset: number
): string {
  return shiftMonth(cashMonth, -offset);
}

export type SalaryEntry = { amount: string; currency: string };

export type SalaryForCashMonth = {
  /** Baz para birimine çevrilmiş tutar; o ay maaş yoksa 0. */
  amount: Decimal;
  /** Tutarın hangi hak ediş ayından geldiği. */
  accrualMonth: string;
  /** O hak ediş ayında hesaplanmış maaş var mıydı. */
  found: boolean;
};

/**
 * Nakit akışında bir ayda görünecek maaşı bulur ve baz para birimine çevirir.
 *
 * Kritik nokta: çevrim, maaşın HAK EDİLDİĞİ ayın kuruyla yapılır — ödendiği
 * ayın kuruyla değil. Tutar zaten hak ediş ayının TCMB ortalamasıyla
 * düzeltilerek hesaplanmıştır; ödeme ayının kuruyla çarpmak aynı kur farkını
 * ikinci kez uygulamak olurdu.
 */
export function salaryForCashMonth({
  cashMonth,
  offset,
  salaryByAccrualMonth,
  toBase,
}: {
  cashMonth: string;
  offset: number;
  salaryByAccrualMonth: ReadonlyMap<string, SalaryEntry>;
  toBase: (amount: Decimal, currency: string, month: string) => Decimal;
}): SalaryForCashMonth {
  const accrualMonth = accrualMonthForCashMonth(cashMonth, offset);
  const entry = salaryByAccrualMonth.get(accrualMonth);

  if (!entry) {
    return { amount: new Decimal(0), accrualMonth, found: false };
  }

  return {
    amount: toBase(new Decimal(entry.amount), entry.currency, accrualMonth),
    accrualMonth,
    found: true,
  };
}
