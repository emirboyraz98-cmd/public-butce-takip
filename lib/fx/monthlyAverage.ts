import Decimal from "decimal.js";
import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from "date-fns";

import { prisma } from "@/lib/prisma";
import { fetchTcmbUsdSellingRate } from "./tcmb";

function isWeekday(date: Date): boolean {
  const day = getDay(date);
  return day !== 0 && day !== 6;
}

function parseMonth(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1));
}

/**
 * Ay içindeki hafta içi günler için TCMB kurlarını cache'ler (eksik olanları
 * çeker). Resmi tatile denk gelen hafta içi günlerde TCMB veri yayınlamaz;
 * bu günler sessizce atlanır.
 */
const TCMB_CONCURRENCY = 6;

export async function ensureTcmbRatesForMonth(month: string): Promise<void> {
  const monthStart = parseMonth(month);
  // Henüz gelmemiş günler için TCMB'de veri olmaz; boşuna istek atıp
  // beklememek için bugünden sonrasını hiç denemeyiz.
  const today = new Date();
  const days = eachDayOfInterval({
    start: startOfMonth(monthStart),
    end: endOfMonth(monthStart),
  }).filter((day) => isWeekday(day) && day <= today);

  // Eksik günler tek sorguda bulunur; eskiden her gün için ayrı bir
  // findUnique atılıyordu (ayda 23 gidiş-dönüş).
  const cached = await prisma.tcmbRateSnapshot.findMany({
    where: { date: { in: days } },
    select: { date: true },
  });
  const have = new Set(cached.map((row) => row.date.getTime()));
  const missing = days.filter((day) => !have.has(day.getTime()));
  if (missing.length === 0) return;

  // Sırayla çekmek yeni bir ay için 23 ardışık HTTPS isteği demekti ve bu
  // istekler sayfa render'ının içinde koşuyordu — TCMB yavaşladığında
  // sunucu fonksiyonu zaman aşımına düşüyordu. Sınırlı eşzamanlılıkla
  // çekiliyor: TCMB'yi yormadan süre birkaç kata düşüyor.
  for (let i = 0; i < missing.length; i += TCMB_CONCURRENCY) {
    const batch = missing.slice(i, i + TCMB_CONCURRENCY);
    const rates = await Promise.all(
      batch.map(async (day) => ({
        day,
        rate: await fetchTcmbUsdSellingRate(day).catch(() => null),
      }))
    );

    for (const { day, rate } of rates) {
      if (!rate) continue;
      await prisma.tcmbRateSnapshot.upsert({
        where: { date: day },
        create: { date: day, usdSale: rate.toString(), source: "tcmb" },
        update: { usdSale: rate.toString(), source: "tcmb" },
      });
    }
  }
}

async function averageForMonth(month: string): Promise<Decimal | null> {
  const monthStart = parseMonth(month);

  const snapshots = await prisma.tcmbRateSnapshot.findMany({
    where: {
      date: { gte: startOfMonth(monthStart), lte: endOfMonth(monthStart) },
    },
  });

  if (snapshots.length === 0) return null;

  const sum = snapshots.reduce(
    (acc, s) => acc.plus(new Decimal(s.usdSale.toString())),
    new Decimal(0)
  );

  return sum.div(snapshots.length);
}

/**
 * Verilen aylar için USD/TRY ortalamalarını TEK sorguda getirir.
 *
 * Geçmiş ayların tutarları bugünkü kurla değil, ait oldukları ayın kuruyla
 * çevrilmelidir; aksi halde kur yükseldikçe geçmiş aylar da olduğundan
 * büyük görünür. Ay ay sorgu atmak yerine aralığın tamamı bir kerede
 * okunup bellekte gruplanır.
 *
 * Veri bulunmayan aylar sonuçta yer almaz (bkz. rateForMonthWithFallback).
 */
export async function getMonthlyAverageRates(
  months: string[]
): Promise<Map<string, Decimal>> {
  if (months.length === 0) return new Map();

  const sorted = [...months].sort();
  const rangeStart = startOfMonth(parseMonth(sorted[0]));
  const rangeEnd = endOfMonth(parseMonth(sorted[sorted.length - 1]));

  const snapshots = await prisma.tcmbRateSnapshot.findMany({
    where: { date: { gte: rangeStart, lte: rangeEnd } },
    select: { date: true, usdSale: true },
  });

  const sums = new Map<string, { total: Decimal; count: number }>();
  for (const s of snapshots) {
    const key = format(s.date, "yyyy-MM");
    const entry = sums.get(key) ?? { total: new Decimal(0), count: 0 };
    entry.total = entry.total.plus(new Decimal(s.usdSale.toString()));
    entry.count += 1;
    sums.set(key, entry);
  }

  const averages = new Map<string, Decimal>();
  for (const [month, { total, count }] of sums) {
    averages.set(month, total.div(count));
  }
  return averages;
}

/**
 * Bir ay için geçerli kuru seçer: önce ayın kendi ortalaması, yoksa veri
 * bulunan en son GEÇMİŞ ay, o da yoksa `fallback` (genelde güncel kur).
 *
 * Gelecek aylara ait projeksiyonlar ve TCMB verisi hiç çekilmemiş eski
 * aylar bu yolla makul bir kura düşer.
 */
export function rateForMonthWithFallback(
  month: string,
  averages: ReadonlyMap<string, Decimal>,
  fallback: Decimal
): { rate: Decimal; isExact: boolean } {
  const own = averages.get(month);
  if (own) return { rate: own, isExact: true };

  let bestMonth: string | null = null;
  for (const candidate of averages.keys()) {
    if (candidate > month) continue;
    if (!bestMonth || candidate > bestMonth) bestMonth = candidate;
  }

  if (bestMonth) return { rate: averages.get(bestMonth)!, isExact: false };
  return { rate: fallback, isExact: false };
}

export async function getMonthlyAverageUsdTryRate(
  month: string
): Promise<Decimal> {
  const average = await averageForMonth(month);

  if (!average) {
    throw new Error(
      `${month} ayı için TCMB kur verisi bulunamadı. Önce kurları yenileyin.`
    );
  }

  return average;
}

export type MonthlyRateResult = {
  rate: Decimal;
  /** Kurun hangi ayın TCMB verisinden geldiği. */
  sourceMonth: string;
  /** true ise hedef ayın kendi verisi yoktu, geçmiş bir ayın kuru kullanıldı. */
  isFallback: boolean;
};

/**
 * Hedef ayın TCMB ortalamasını döner. O ayın verisi henüz yayınlanmadıysa
 * (örn. ileri tarihli bir ay) hata vermek yerine, veri bulunan en son
 * geçmiş ayın ortalamasına düşer — sonuç boş görünmesin diye. Hangi ayın
 * kullanıldığı `sourceMonth`/`isFallback` ile bildirilir ki arayüzde
 * "geçici kur" olduğu belirtilebilsin.
 */
export async function getMonthlyAverageUsdTryRateWithFallback(
  month: string
): Promise<MonthlyRateResult> {
  const own = await averageForMonth(month);
  if (own) return { rate: own, sourceMonth: month, isFallback: false };

  const latestBefore = await prisma.tcmbRateSnapshot.findFirst({
    where: { date: { lt: startOfMonth(parseMonth(month)) } },
    orderBy: { date: "desc" },
  });

  if (latestBefore) {
    const fallbackMonth = format(latestBefore.date, "yyyy-MM");
    const fallbackRate = await averageForMonth(fallbackMonth);
    if (fallbackRate) {
      return { rate: fallbackRate, sourceMonth: fallbackMonth, isFallback: true };
    }
  }

  throw new Error(
    `${month} ayı için TCMB kur verisi bulunamadı ve yedek olarak kullanılabilecek geçmiş bir ay da yok.`
  );
}
