import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";

import { prisma } from "@/lib/prisma";
import { computeMonthNominal } from "./computeMonth";
import { applyFxCorrection } from "./fxCorrection";
import { findApplicableByPeriod } from "./effectiveRate";
import { toDateKey, type DayExceptionMap } from "./holidayCalendar";
import {
  ensureTcmbRatesForMonth,
  getMonthlyAverageUsdTryRateWithFallback,
} from "@/lib/fx/monthlyAverage";

const MAX_AUTO_MONTHS = 240; // güvenlik sınırı (20 yıl)

/**
 * Hesaplama kurallarının sürümü. Bir gün tipinin katsayısı, sınıflandırma
 * önceliği ya da ay normalizasyonu değiştiğinde ARTIR: sayfa açılışındaki
 * yeniden hesaplama, bu sürümün gerisinde kalan kayıtlı ayları eksik ay gibi
 * ele alıp tazeler.
 *
 * 1: Pazar, resmi tatilden önce sınıflandırılıyor. Tatile denk gelen bir
 *    pazarda çalışıldığında gün pazar ücretinden (22.5) ödenir; önceden
 *    tatil ücretinden (18.75) ödeniyordu.
 */
export const SALARY_FORMULA_VERSION = 1;

function parseMonth(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1));
}

function monthsBetween(from: string, to: string): string[] {
  if (from > to) return [];
  const months: string[] = [];
  let cursor = parseMonth(from);
  const end = parseMonth(to);
  while (cursor <= end && months.length < MAX_AUTO_MONTHS) {
    months.push(format(cursor, "yyyy-MM"));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export type MonthRangeSource = {
  /** Dönem başlangıcı (yyyy-MM). */
  from: string;
  /** Dönem bitişi (yyyy-MM); null ise açık uçlu. */
  to: string | null;
};

/**
 * Hangi ayların hesaplanacağını belirler.
 *
 * Bitiş ayı bugünden ileride olsa bile dahil edilir — kullanıcı takvimde
 * ileri tarihli gün işaretlediyse ya da ileri tarihli bir dönem girdiyse o
 * aylar da sonuç tablosunda görünmeli. Açık uçlu dönemler (bitişi olmayan
 * baz maaş dönemleri) sonsuz ay üretmemek için kesilir.
 *
 * Kesme noktası `max(içinde bulunulan ay, dönemin başlangıcı)`: düz
 * `currentMonth` yazmak, GELECEKTE başlayan açık uçlu bir dönemde
 * `from > to` yapıp aralığı tamamen boşaltıyordu. "Üç ay sonra sabit maaşa
 * geçeceğim" deyip bitiş tarihini boş bırakan kullanıcının dönemi hiçbir ay
 * üretmiyor, maaş tablosunda da Genel Bakış'ta da hiç görünmüyordu.
 */
export function collectMonthsToCompute(
  sources: MonthRangeSource[],
  currentMonth: string
): string[] {
  const months = new Set<string>();

  for (const { from, to } of sources) {
    const end = to ?? (from > currentMonth ? from : currentMonth);
    for (const m of monthsBetween(from, end)) {
      months.add(m);
    }
  }

  return [...months].sort();
}

/**
 * Ayın maaş türünü, o ayı kapsayan baz maaş döneminden okur.
 *
 * Tür kullanıcıda tutulduğunda tek bir seçim bütün geçmişi yeniden
 * yorumluyordu: değişkenden sabite geçen biri, çalıştığı ayların gün bazlı
 * hesabını da kaybediyordu. Dönemler tam aylar olduğu için ayın türü tektir
 * ve ayın ilk gününü kapsayan dönemden okunur.
 */
export function findRateForMonth<
  T extends { effectiveFrom: Date; effectiveTo: Date | null }
>(month: string, rates: T[]): T | null {
  return findApplicableByPeriod(startOfMonth(parseMonth(month)), rates);
}

export async function resolveMonthMode(userId: string, month: string) {
  const rates = await prisma.baseSalaryRate.findMany({ where: { userId } });
  const applicable = findRateForMonth(
    month,
    rates.map((r) => ({ ...r, amount: r.amount.toString() }))
  );

  if (!applicable) {
    throw new Error(
      `${month} ayı için geçerli bir baz maaş dönemi bulunamadı. Maaş ayarları'ndan bu ayı kapsayan bir dönem ekleyin.`
    );
  }

  return applicable;
}

export async function computeAndSaveMonth(userId: string, month: string) {
  const applicable = await resolveMonthMode(userId, month);

  return applicable.mode === "FIXED"
    ? computeFixedMonth(userId, month, applicable)
    : computeVariableMonth(userId, month);
}

async function computeFixedMonth(
  userId: string,
  month: string,
  applicable: { amount: string; currency: "TRY" | "USD" }
) {
  return prisma.monthlySalaryResult.upsert({
    where: { userId_month: { userId, month } },
    create: {
      userId,
      month,
      mode: "FIXED",
      currency: applicable.currency,
      total: applicable.amount,
      nominalTotal: null,
      avgUsdTryRate: null,
      fxRateMonth: null,
      referenceRate: null,
      breakdown: undefined,
      formulaVersion: SALARY_FORMULA_VERSION,
    },
    update: {
      mode: "FIXED",
      currency: applicable.currency,
      total: applicable.amount,
      nominalTotal: null,
      avgUsdTryRate: null,
      fxRateMonth: null,
      referenceRate: null,
      breakdown: undefined,
      formulaVersion: SALARY_FORMULA_VERSION,
      computedAt: new Date(),
    },
  });
}

async function computeVariableMonth(userId: string, month: string) {
  const monthStart = parseMonth(month);
  const monthEnd = endOfMonth(monthStart);

  const [baseSalaryRates, referenceFxRates, holidays, exceptions] =
    await Promise.all([
      prisma.baseSalaryRate.findMany({ where: { userId } }),
      prisma.referenceFxRate.findMany({ where: { userId } }),
      prisma.publicHoliday.findMany(),
      prisma.salaryDayException.findMany({ where: { userId } }),
    ]);

  const holidayDateKeys = new Set(holidays.map((h) => toDateKey(h.date)));
  const dayExceptions: DayExceptionMap = new Map(
    exceptions.map((e) => [toDateKey(e.date), e.dayType])
  );

  const nominal = computeMonthNominal(
    month,
    // Aralık yok: gün tipleri artık yalnızca takvimde işaretlenen günlerden
    // geliyor. İşaretsiz gün hiçbir tipe girmez ve maaşa katılmaz.
    [],
    baseSalaryRates.map((r) => ({
      amount: r.amount.toString(),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
    holidayDateKeys,
    dayExceptions
  );

  const referenceRateEntry = findApplicableByPeriod(
    monthEnd,
    referenceFxRates.map((r) => ({
      rate: r.rate.toString(),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }))
  );

  if (!referenceRateEntry) {
    throw new Error(
      `${month} ayı için geçerli bir referans kur bulunamadı. Önce Ayarlar'dan bir referans kur ekleyin.`
    );
  }

  await ensureTcmbRatesForMonth(month);
  const fx = await getMonthlyAverageUsdTryRateWithFallback(month);

  const usdTotal = applyFxCorrection(
    nominal.usdNominalTotal,
    referenceRateEntry.rate,
    fx.rate
  );

  const breakdown = {
    days: nominal.breakdown,
    dayTypeCounts: nominal.dayTypeCounts,
    // Ayı 30 güne normalize eden düzeltme; tutarı sessizce değiştirdiği için
    // sonuçla birlikte saklanır ve arayüzde gösterilir.
    monthLengthAdjustment: nominal.monthLengthAdjustment,
    monthLengthAdjustmentUsd: nominal.monthLengthAdjustmentUsd.toFixed(2),
  };

  return prisma.monthlySalaryResult.upsert({
    where: { userId_month: { userId, month } },
    create: {
      userId,
      month,
      mode: "VARIABLE",
      currency: "USD",
      nominalTotal: nominal.usdNominalTotal.toFixed(2),
      avgUsdTryRate: fx.rate.toFixed(4),
      fxRateMonth: fx.sourceMonth,
      referenceRate: referenceRateEntry.rate,
      total: usdTotal.toFixed(2),
      breakdown,
      formulaVersion: SALARY_FORMULA_VERSION,
    },
    update: {
      mode: "VARIABLE",
      currency: "USD",
      nominalTotal: nominal.usdNominalTotal.toFixed(2),
      avgUsdTryRate: fx.rate.toFixed(4),
      fxRateMonth: fx.sourceMonth,
      referenceRate: referenceRateEntry.rate,
      total: usdTotal.toFixed(2),
      breakdown,
      formulaVersion: SALARY_FORMULA_VERSION,
      computedAt: new Date(),
    },
  });
}

export type RecomputeSummary = {
  computed: string[];
  failed: { month: string; error: string }[];
  /** Kaynağı kalmadığı için sonuç tablosundan silinen aylar. */
  removed: string[];
};

/**
 * Kaydedilmiş sonuçlardan hangilerinin artık karşılığı olmadığını bulur.
 *
 * Maaş sonuçları işaretli günlerden (sabit modda baz maaş dönemlerinden)
 * türetilir; bir ayın son işaretli günü de silindiğinde o ay düşmeli. Aksi
 * halde artık karşılığı olmayan tutarlar tabloda ve grafikte kalıcı olarak
 * asılı kalıyordu.
 */
export function monthsToRemove(existing: string[], target: string[]): string[] {
  const keep = new Set(target);
  return existing.filter((month) => !keep.has(month)).sort();
}

/**
 * Kaynak verideki (işaretli günler / baz maaş dönemleri) her değişiklikten
 * sonra çağrılır: hangi aylar etkileniyorsa onları otomatik yeniden
 * hesaplar. Kullanıcının elle "Ayı Hesapla" demesine gerek kalmaz.
 * Eksik veri yüzünden hesaplanamayan aylar (örn. referans kur yok) atlanır
 * ve sebebiyle birlikte `failed` içinde döner ki arayüzde gösterilebilsin.
 */
export async function recomputeAllMonths(userId: string): Promise<RecomputeSummary> {
  return recompute(userId, { onlyMissing: false });
}

/**
 * Sayfa açılışında çağrılır: yalnızca sonucu OLMAYAN ayları hesaplar.
 *
 * Kaynak veri her değiştiğinde aksiyonlar zaten tam hesaplamayı tetikliyor,
 * dolayısıyla mevcut satırlar güncel. Sayfa her açıldığında hepsini yeniden
 * yazmak, aylık kayıt sayısı × ziyaret sayısı kadar gereksiz veritabanı
 * yazması demekti — 24 aylık geçmişi olan biri sayfayı her açtığında 24
 * upsert. Bu, ücretsiz katmanda en çok compute yiyen işti.
 *
 * Eksik ay iki durumda oluşur ve ikisi de burada yakalanır: takvim yeni bir
 * aya geçtiğinde (açık uçlu baz maaşta) ve daha önce eksik veri yüzünden
 * hesaplanamamış aylarda.
 */
export async function recomputeMissingMonths(
  userId: string
): Promise<RecomputeSummary> {
  return recompute(userId, { onlyMissing: true });
}

async function recompute(
  userId: string,
  { onlyMissing }: { onlyMissing: boolean }
): Promise<RecomputeSummary> {
  const currentMonth = format(new Date(), "yyyy-MM");

  // Değişken maaşta hesaplanacak aylar takvimde işaretlenmiş günlerden
  // çıkar: bir ayda tek gün bile işaretliyse o ay hesaplanır, hiç işaret
  // yoksa hesaplanmaz (ve varsa eski sonucu silinir). Eskiden aralıkların
  // kapsadığı aylar sayılıyordu; aralıklar kaldırılınca kaynak da değişti.
  const [rates, markedDays] = await Promise.all([
    prisma.baseSalaryRate.findMany({ where: { userId } }),
    prisma.salaryDayException.findMany({
      where: { userId },
      select: { date: true },
    }),
  ]);

  const sources: MonthRangeSource[] = [
    // Sabit dönemler kendi başlarına ay üretir: çalışılan gün girilmese de
    // her ay aynı tutar ödenir.
    ...rates
      .filter((r) => r.mode === "FIXED")
      .map((r) => ({
        from: format(r.effectiveFrom, "yyyy-MM"),
        to: r.effectiveTo ? format(r.effectiveTo, "yyyy-MM") : null,
      })),
    // Değişken taraf işaretli günlerden geliyor. Ayın türü yine dönemden
    // okunuyor; sabit bir aya düşen işaretler hesaba girmez, o ay zaten
    // sabit yoldan hesaplanır.
    ...markedDays.map((e) => {
      const m = format(e.date, "yyyy-MM");
      return { from: m, to: m };
    }),
  ];

  const summary: RecomputeSummary = { computed: [], failed: [], removed: [] };
  const targetMonths = collectMonthsToCompute(sources, currentMonth);

  const existing = await prisma.monthlySalaryResult.findMany({
    where: { userId },
    select: { month: true, formulaVersion: true },
  });
  const existingMonths = new Set(existing.map((r) => r.month));
  // Formül değiştiğinde eski sürümle yazılmış aylar da tazelenmeli; yoksa
  // düzeltme yalnızca yeni aylara işler, geçmiş aylar eski tutarda donar.
  const staleMonths = new Set(
    existing
      .filter((r) => r.formulaVersion < SALARY_FORMULA_VERSION)
      .map((r) => r.month)
  );

  const toCompute = onlyMissing
    ? targetMonths.filter(
        (month) => !existingMonths.has(month) || staleMonths.has(month)
      )
    : targetMonths;

  for (const month of toCompute) {
    try {
      await computeAndSaveMonth(userId, month);
      summary.computed.push(month);
    } catch (err) {
      summary.failed.push({
        month,
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      });
    }
  }

  // Artık hiçbir dönemin kapsamadığı aylar temizlenir. Hesaplaması başarısız
  // olan aylar hedef listede kaldığı için silinmez: kur çekilememesi gibi
  // geçici bir hata yüzünden geçmiş sonuç kaybolmasın.
  const orphans = monthsToRemove([...existingMonths], targetMonths);

  if (orphans.length > 0) {
    await prisma.monthlySalaryResult.deleteMany({
      where: { userId, month: { in: orphans } },
    });
    summary.removed = orphans;
  }

  return summary;
}
