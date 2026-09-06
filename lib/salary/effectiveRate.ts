const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Bir tarihi, saat bileşeninden bağımsız olarak o takvim gününün UTC 00:00'ına
 * indirger. Veritabanından okunan @db.Date alanları her zaman UTC gece
 * yarısı olarak gelir, ama `date-fns`'in `endOfMonth` gibi yardımcıları yerel
 * saat dilimine göre gün sonu (23:59:59.999) üretir. Bu iki temsili
 * doğrudan `getTime()` ile kıyaslamak, bir dönemin son ayını sınırın dışında
 * bırakabilir — bu yüzden her karşılaştırmadan önce normalize ediyoruz.
 */
function toUtcDayTime(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Verilen tarihi kapsayan dönemi bulur: effectiveFrom <= date <= effectiveTo
 * (effectiveTo null ise "hâlâ geçerli" anlamına gelir, yani üst sınır yok).
 * Birden fazla eşleşme varsa (olmaması gerekir, girişte çakışma engellenir)
 * en son başlayanı döner.
 */
export function findApplicableByPeriod<
  T extends { effectiveFrom: Date; effectiveTo: Date | null }
>(date: Date, entries: T[]): T | null {
  const dateTime = toUtcDayTime(date);
  let best: T | null = null;
  let bestFromTime = -Infinity;

  for (const entry of entries) {
    const fromTime = toUtcDayTime(entry.effectiveFrom);
    if (fromTime > dateTime) continue;
    if (entry.effectiveTo && toUtcDayTime(entry.effectiveTo) < dateTime) continue;
    if (!best || fromTime > bestFromTime) {
      best = entry;
      bestFromTime = fromTime;
    }
  }

  return best;
}

/**
 * İki dönemin (effectiveFrom/effectiveTo, effectiveTo null = sınırsız)
 * çakışıp çakışmadığını kontrol eder.
 */
export function periodsOverlap(
  a: { effectiveFrom: Date; effectiveTo: Date | null },
  b: { effectiveFrom: Date; effectiveTo: Date | null }
): boolean {
  const aEnd = a.effectiveTo ? toUtcDayTime(a.effectiveTo) : Infinity;
  const bEnd = b.effectiveTo ? toUtcDayTime(b.effectiveTo) : Infinity;
  return toUtcDayTime(a.effectiveFrom) <= bEnd && toUtcDayTime(b.effectiveFrom) <= aEnd;
}

/** Ay başlangıcı olan bir tarihten bir gün öncesine (önceki ayın son günü) gider. */
function dayBefore(monthStart: Date): Date {
  return new Date(toUtcDayTime(monthStart) - MS_PER_DAY);
}

/** Ay sonu olan bir tarihten bir gün sonrasına (sonraki ayın ilk günü) gider. */
function dayAfter(monthEnd: Date): Date {
  return new Date(toUtcDayTime(monthEnd) + MS_PER_DAY);
}

export type PeriodLike = { id: string; effectiveFrom: Date; effectiveTo: Date | null };

export type OverlapResolution<T extends PeriodLike> = {
  /** Yeni dönem tarafından tamamen kapsanan, artık gereksiz kalan dönemler. */
  deleteIds: string[];
  /** Yeni döneme yol vermek için başlangıcı/bitişi kısaltılan dönemler. */
  updates: { id: string; effectiveFrom: Date; effectiveTo: Date | null }[];
  /**
   * Yeni dönem, mevcut bir dönemin ortasına "delik" açtığında geriye kalan
   * kuyruk parçası — orijinal dönemin diğer alanlarıyla (tutar, kur, vb.)
   * ayrı bir kayıt olarak yeniden oluşturulmalı.
   */
  creates: { effectiveFrom: Date; effectiveTo: Date | null; source: T }[];
};

/**
 * Yeni eklenen/düzenlenen dönem her zaman kazanır: onunla çakışan mevcut
 * dönemler otomatik olarak yeni döneme yol verecek şekilde kısaltılır (veya
 * tamamen kapsanıyorsa silinir, ya da yeni dönem ortasına denk geliyorsa
 * ikiye bölünür). Kullanıcının elle "çakışıyor" hatasını görüp eski dönemi
 * silmesine gerek kalmaz.
 */
export function resolveOverlaps<T extends PeriodLike>(
  existing: T[],
  newPeriod: { effectiveFrom: Date; effectiveTo: Date | null }
): OverlapResolution<T> {
  const deleteIds: string[] = [];
  const updates: { id: string; effectiveFrom: Date; effectiveTo: Date | null }[] = [];
  const creates: { effectiveFrom: Date; effectiveTo: Date | null; source: T }[] = [];

  for (const period of existing) {
    if (!periodsOverlap(period, newPeriod)) continue;

    const startsBefore =
      toUtcDayTime(period.effectiveFrom) < toUtcDayTime(newPeriod.effectiveFrom);
    const endsAfter =
      newPeriod.effectiveTo !== null &&
      (period.effectiveTo === null ||
        toUtcDayTime(period.effectiveTo) > toUtcDayTime(newPeriod.effectiveTo));

    if (startsBefore && endsAfter) {
      updates.push({
        id: period.id,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: dayBefore(newPeriod.effectiveFrom),
      });
      creates.push({
        effectiveFrom: dayAfter(newPeriod.effectiveTo!),
        effectiveTo: period.effectiveTo,
        source: period,
      });
    } else if (startsBefore) {
      updates.push({
        id: period.id,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: dayBefore(newPeriod.effectiveFrom),
      });
    } else if (endsAfter) {
      updates.push({
        id: period.id,
        effectiveFrom: dayAfter(newPeriod.effectiveTo!),
        effectiveTo: period.effectiveTo,
      });
    } else {
      deleteIds.push(period.id);
    }
  }

  return { deleteIds, updates, creates };
}
