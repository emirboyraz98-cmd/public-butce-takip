/**
 * Kredi kartı harcamalarında iki ayrı tarih vardır ve bunları karıştırmak
 * analizi bozar:
 *
 * - **Harcama ayı** (`date`): "temmuzda ne kadar yemeğe verdim" sorusunun
 *   cevabı. Kategori dağılımı ve harcama alışkanlığı bunu kullanır.
 * - **Ödeme ayı** (`paymentMonth`): para cebinden ne zaman çıktı. Genel
 *   Bakış'taki nakit akışı bunu kullanır.
 *
 * Ödeme ayı kayıt bazında saklanır; kullanıcının varsayılan gecikme ayarı
 * yalnızca yeni kayıt eklerken öneri üretir. Ayar sonradan değişse bile
 * geçmiş kayıtlar yerinden oynamaz.
 */

import Decimal from "decimal.js";

/** yyyy-MM biçimindeki bir aya ay ekler/çıkarır. */
export function shiftMonth(month: string, offset: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** yyyy-MM-dd (ya da ISO tarih) → yyyy-MM. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * Yeni bir kredi kartı harcaması için önerilen ödeme ayı: harcamanın ayı +
 * kullanıcının ekstre gecikmesi.
 */
export function suggestPaymentMonth(
  spendDate: string,
  offset: number
): string {
  return shiftMonth(monthOf(spendDate), offset);
}

/**
 * Kesim gününe göre ekstre ayı.
 *
 * Sabit ay kaydırması (`suggestPaymentMonth`) tüm ayı tek parça sayıyor:
 * "ağustos harcamaları eylülde ödenir". Gerçekte ekstre ayın ortasında
 * kesiliyor, yani ayın başındaki harcama ile sonundaki harcama FARKLI
 * ekstrelere düşüyor. Kesim günü 14 iken 3 Ağustos'taki harcama 14
 * Ağustos ekstresine (ağustosta ödenir), 20 Ağustos'taki ise 14 Eylül
 * ekstresine (eylülde ödenir) girer.
 *
 * Otomatik aktarım bunu kullanır; elle giriş formu kullanıcının sabit
 * gecikme ayarıyla çalışmaya devam ediyor.
 */
export function statementMonthFor(
  spendDate: string,
  statementDay: number
): string {
  const day = Number(spendDate.slice(8, 10));
  const month = monthOf(spendDate);
  return day <= statementDay ? month : shiftMonth(month, 1);
}

export type CreditCardExpense = {
  /** yyyy-MM-dd */
  date: string;
  /** yyyy-MM; boşsa harcama kendi ayında ödenmiş sayılır. */
  paymentMonth: string | null;
};

/**
 * Kaydın nakit akışına gireceği ay. Ödeme ayı yoksa harcamanın kendi ayına
 * düşülür — böylece eski kayıtlar ve nakit giderler aynı kodla işlenir.
 */
export function cashMonthOf(expense: CreditCardExpense): string {
  return expense.paymentMonth ?? monthOf(expense.date);
}

/**
 * Ödeme ayı, harcama ayından önce olamaz: kart harcaması ödendikten sonra
 * yapılamaz. Formlar ve toplu düzenleme bunu kullanır.
 */
export function isValidPaymentMonth(
  spendDate: string,
  paymentMonth: string
): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(paymentMonth)) return false;
  return paymentMonth >= monthOf(spendDate);
}

/**
 * Ödeme ayı için seçenek listesi: harcama ayından başlayıp birkaç ay
 * ileriye kadar. Kullanıcı listeden seçer, elle ay yazmak zorunda kalmaz.
 */
export function paymentMonthOptions(
  spendDate: string,
  aheadCount = 6
): string[] {
  const start = monthOf(spendDate);
  return Array.from({ length: aheadCount + 1 }, (_, i) => shiftMonth(start, i));
}

/** yyyy-MM biçimindeki iki ay arasındaki tam ay farkı (to - from). */
function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Kaydın kendi ödeme gecikmesi (ay). Kayıt bazında saklandığı için
 * kullanıcının güncel ayarından bağımsızdır.
 */
export function paymentOffsetOf(expense: CreditCardExpense): number {
  if (!expense.paymentMonth) return 0;
  return monthDiff(monthOf(expense.date), expense.paymentMonth);
}

export type RecurringExpense = CreditCardExpense & {
  frequency: "ONE_TIME" | "MONTHLY";
};

export type InstallmentExpense = RecurringExpense & {
  /** TOPLAM tutar — aylık taksit değil. */
  amount: Decimal | string | number;
  /** 1 = tek çekim. */
  installmentCount: number;
};

/**
 * Toplam tutarı taksitlere böler.
 *
 * Kuruş artığı SON taksite eklenir; eşit bölüp yuvarlamak toplamı bozardı
 * (1.000 / 3 = 333,33 × 3 = 999,99 gibi). Böylece taksitlerin toplamı her
 * zaman girilen tutara eşit kalır.
 */
export function splitInstallments(
  total: Decimal | string | number,
  count: number
): Decimal[] {
  const amount = new Decimal(total);
  if (count <= 1) return [amount];

  const per = amount.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const parts = Array.from({ length: count - 1 }, () => per);
  const last = amount.minus(per.mul(count - 1));

  return [...parts, last];
}

/**
 * Taksitin düştüğü aylar: ilk ödeme ayından başlayarak `installmentCount`
 * ay. Tek çekimde tek elemanlı liste döner.
 */
export function installmentMonths(expense: InstallmentExpense): string[] {
  const first = cashMonthOf(expense);
  const count = Math.max(1, expense.installmentCount);
  return Array.from({ length: count }, (_, i) => shiftMonth(first, i));
}

/**
 * Kaydın verilen NAKİT ayında yarattığı para çıkışı. Taksitli harcamada
 * yalnızca o aya düşen taksit, taksitsizde tutarın tamamı döner; ay
 * kapsam dışıysa sıfır.
 */
export function cashAmountForMonth(
  expense: InstallmentExpense,
  month: string
): Decimal {
  const count = Math.max(1, expense.installmentCount);

  // Aylık tekrarlayan kayıtlar taksitlendirilmez; her tekrar tam tutardır.
  if (expense.frequency === "MONTHLY") {
    return appliesToCashMonth(expense, month)
      ? new Decimal(expense.amount)
      : new Decimal(0);
  }

  const months = installmentMonths(expense);
  const index = months.indexOf(month);
  if (index === -1) return new Decimal(0);

  return splitInstallments(expense.amount, count)[index];
}

/**
 * Kayıt, verilen NAKİT ayında para çıkışı yaratıyor mu?
 *
 * Tek seferlik harcama yalnızca ödeme ayında çıkar. Aylık tekrarlayan bir
 * kart harcaması (abonelik) ise harcama ayından itibaren her ay tekrarlar
 * ve her tekrarı kendi ödeme gecikmesi kadar ileride ödenir — bu yüzden
 * kaydın sabit ödeme ayı değil, gecikmesi uygulanır.
 */
export function appliesToCashMonth(
  expense: RecurringExpense,
  month: string
): boolean {
  if (expense.frequency === "ONE_TIME") return cashMonthOf(expense) === month;

  const firstCashMonth = shiftMonth(monthOf(expense.date), paymentOffsetOf(expense));
  return firstCashMonth <= month;
}

/**
 * Kayıt, verilen HARCAMA ayında yapılmış mı? Kategori dağılımı ve harcama
 * alışkanlığı bunu kullanır — paranın ne zaman çıktığı burada önemsizdir.
 */
export function appliesToSpendMonth(
  expense: Pick<RecurringExpense, "date" | "frequency">,
  month: string
): boolean {
  const spendMonth = monthOf(expense.date);
  if (expense.frequency === "ONE_TIME") return spendMonth === month;
  return spendMonth <= month;
}

export type CardExpenseWithCurrency = InstallmentExpense & { currency: string };

/**
 * Ay bazında ekstre tutarları, para birimine göre ayrılmış.
 *
 * Farklı para birimindeki ekstreler tek bakiyede toplanamaz; karıştırmak
 * sessizce yanlış borç üretirdi. Bu yüzden defter para birimi başına ayrı
 * kurulur.
 */
export function statementTotalsByCurrency(
  expenses: readonly CardExpenseWithCurrency[],
  months: readonly string[]
): Map<string, Map<string, Decimal>> {
  const byCurrency = new Map<string, Map<string, Decimal>>();

  for (const expense of expenses) {
    let totals = byCurrency.get(expense.currency);
    if (!totals) {
      totals = new Map<string, Decimal>();
      byCurrency.set(expense.currency, totals);
    }

    for (const month of months) {
      const amount = cashAmountForMonth(expense, month);
      if (amount.isZero()) continue;
      totals.set(month, (totals.get(month) ?? new Decimal(0)).plus(amount));
    }
  }

  return byCurrency;
}
