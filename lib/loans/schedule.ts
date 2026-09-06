import Decimal from "decimal.js";

/**
 * Kredi taksitlerinin aylara dağıtılması.
 *
 * Krediler maaştan iki noktada ayrılır:
 *
 * 1. **Paralel ilerlerler.** Aynı anda konut + taşıt kredin olabilir, bu
 *    yüzden maaştaki "tek zaman çizgisi" modeli kullanılamaz. Her kredi
 *    kendi dönemlerini taşır; bir ayın kredi gideri o ay aktif olan tüm
 *    kredilerin toplamıdır.
 * 2. **Sonları bellidir.** Kredi 24 taksit sürer. Sonu açık bırakılırsa
 *    projeksiyonda sonsuza kadar gider yazar — bu yüzden `endMonth` yoksa
 *    çağıran tarafın uyarması için `isOpenEnded` ayrıca raporlanır.
 *
 * Dönemler yalnızca başlangıç ayı tutar; bir dönem, bir sonraki dönem
 * başlayana kadar geçerlidir. Böylece iki dönem ne çakışabilir ne de
 * aralarında boşluk kalabilir.
 */

export type LoanPeriodInput = {
  /** yyyy-MM */
  effectiveFrom: string;
  amount: Decimal | string | number;
};

export type LoanInput = {
  id: string;
  name: string;
  currency: string;
  /** yyyy-MM */
  startMonth: string;
  /** yyyy-MM; boşsa kredi süresiz kabul edilir. */
  endMonth: string | null;
  periods: LoanPeriodInput[];
};

/**
 * Taksit takvimi üretmek için yeten alanlar. Kimlik gerekmez; kaydedilmemiş
 * kredilerde (dışa aktarma, önizleme) de kullanılabilsin diye ayrı tutulur.
 */
export type LoanScheduleInput = Omit<LoanInput, "id">;

/**
 * Bir kredinin verilen aydaki taksiti. Kredi o ay aktif değilse null döner
 * (sıfır değil — "taksit yok" ile "taksit sıfır" ayrımı çağıran tarafta işe
 * yarar).
 *
 * Kredinin başlangıcı ile ilk ödeme döneminin başlangıcı arasındaki aylar
 * bilerek İLK DÖNEMİN tutarıyla doldurulur. Aksi halde bu aylar hiçbir
 * toplama girmiyordu: kredi ocakta başlayıp ilk dönem marttan tanımlıysa
 * 12 aylık kredi 10 taksit sayılıyor, kalan borç ve toplam ödeme olduğundan
 * düşük çıkıyordu. Arayüz "bu ayda taksit yok" demenin bir yolunu
 * sunmadığından böyle bir boşluk her zaman veri eksiğidir, kasıt değil.
 */
export function installmentForMonth(
  loan: LoanScheduleInput,
  month: string
): Decimal | null {
  if (month < loan.startMonth) return null;
  if (loan.endMonth && month > loan.endMonth) return null;
  if (loan.periods.length === 0) return null;

  // Ayı kapsayan dönem: başlangıcı bu aydan büyük olmayanların en geç olanı.
  let best: LoanPeriodInput | null = null;
  let earliest: LoanPeriodInput | null = null;
  for (const period of loan.periods) {
    if (!earliest || period.effectiveFrom < earliest.effectiveFrom) {
      earliest = period;
    }
    if (period.effectiveFrom > month) continue;
    if (!best || period.effectiveFrom > best.effectiveFrom) best = period;
  }

  return new Decimal((best ?? earliest!).amount);
}

export type LoanMonthEntry = {
  loanId: string;
  name: string;
  currency: string;
  amount: Decimal;
};

/** Verilen ayda taksiti olan tüm kredileri döner. */
export function loanEntriesForMonth(
  loans: LoanInput[],
  month: string
): LoanMonthEntry[] {
  const entries: LoanMonthEntry[] = [];

  for (const loan of loans) {
    const amount = installmentForMonth(loan, month);
    if (!amount) continue;
    entries.push({
      loanId: loan.id,
      name: loan.name,
      currency: loan.currency,
      amount,
    });
  }

  return entries;
}

/** Kredinin sonu belirtilmemişse projeksiyonda sonsuza kadar sürer. */
export function isOpenEnded(loan: Pick<LoanInput, "endMonth">): boolean {
  return !loan.endMonth;
}

/** yyyy-MM biçimindeki iki ay arasındaki tam ay farkı (to - from). */
export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export type LoanSummary = {
  /** Toplam taksit sayısı; kredi süresizse null. */
  totalInstallments: number | null;
  /** `asOfMonth` DAHİL, bundan sonra kalan taksit sayısı; süresizse null. */
  remainingInstallments: number | null;
  /**
   * `asOfMonth` DAHİL ödenecek toplam; süresizse null. İçinde bulunulan ayın
   * taksiti hâlâ ödenecekler arasındadır — bu aya kadar ödenmiş sayılmaz.
   */
  remainingTotal: Decimal | null;
  /** `asOfMonth` HARİÇ, geçmiş aylarda ödenmiş toplam. */
  paidTotal: Decimal;
  /**
   * Kredinin baştan sona toplam maliyeti (ödenen + kalan). Süresiz kredide
   * takvim sonsuz olacağından null.
   */
  totalPayable: Decimal | null;
};

/**
 * Kredinin özeti: kaç taksit kaldı, ne kadar borç kaldı, ne kadar ödendi.
 * Süresiz kredilerde "kalan" hesaplanamaz, null döner.
 */
export function summarizeLoan(loan: LoanInput, asOfMonth: string): LoanSummary {
  const paidTotal = sumBetween(loan, loan.startMonth, previousMonth(asOfMonth));

  if (!loan.endMonth) {
    return {
      totalInstallments: null,
      remainingInstallments: null,
      remainingTotal: null,
      paidTotal,
      totalPayable: null,
    };
  }

  const totalInstallments = monthDiff(loan.startMonth, loan.endMonth) + 1;
  const firstUnpaid = asOfMonth > loan.startMonth ? asOfMonth : loan.startMonth;
  const remainingInstallments = Math.max(
    0,
    monthDiff(firstUnpaid, loan.endMonth) + 1
  );

  const remainingTotal = sumBetween(loan, firstUnpaid, loan.endMonth);

  return {
    totalInstallments: Math.max(0, totalInstallments),
    remainingInstallments,
    remainingTotal,
    paidTotal,
    totalPayable: paidTotal.plus(remainingTotal),
  };
}

export type ScheduledInstallment = {
  /** yyyy-MM */
  month: string;
  amount: Decimal;
  /** Kullanıcı bu taksiti elle "ödendi" işaretledi mi. */
  paid: boolean;
  /** Takvime göre bu ay geçmişte mi kaldı (`asOfMonth`'tan önce). */
  past: boolean;
};

/**
 * Kredinin tüm taksit takvimi. "Kalan borç"un neden o rakam olduğunu
 * gösterebilmek için üretilir: liste, toplamı oluşturan tek tek ayları
 * ortaya koyar.
 *
 * Süresiz kredilerde takvim sonsuz olacağından boş döner.
 */
export function installmentSchedule(
  loan: LoanScheduleInput,
  asOfMonth: string,
  paidMonths: readonly string[] = []
): ScheduledInstallment[] {
  if (!loan.endMonth) return [];

  const paid = new Set(paidMonths);
  const schedule: ScheduledInstallment[] = [];

  for (
    let month = loan.startMonth;
    month <= loan.endMonth;
    month = nextMonth(month)
  ) {
    const amount = installmentForMonth(loan, month);
    if (!amount) continue;
    schedule.push({
      month,
      amount,
      paid: paid.has(month),
      past: month < asOfMonth,
    });
  }

  return schedule;
}

/** İşaretlenmemiş taksitlerin toplamı — elle takip edenler için. */
export function uncheckedTotal(schedule: ScheduledInstallment[]): Decimal {
  return schedule
    .filter((item) => !item.paid)
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
}

/** İki ay arasındaki (her ikisi dahil) taksitlerin toplamı. */
function sumBetween(loan: LoanInput, from: string, to: string): Decimal {
  let total = new Decimal(0);
  if (from > to) return total;

  for (let month = from; month <= to; month = nextMonth(month)) {
    const amount = installmentForMonth(loan, month);
    if (amount) total = total.plus(amount);
  }

  return total;
}

function shift(month: string, offset: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  return shift(month, 1);
}

export function previousMonth(month: string): string {
  return shift(month, -1);
}
