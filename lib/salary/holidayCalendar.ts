import { isSundayUtc, toDateKeyUtc } from "@/lib/date/utc";

import type { DayType } from "./dailyFormula";

export function toDateKey(date: Date): string {
  return toDateKeyUtc(date);
}

export function isSunday(date: Date): boolean {
  return isSundayUtc(date);
}

/** Gün bazlı elle düzeltmeler: yyyy-MM-dd -> gün tipi. */
export type DayExceptionMap = ReadonlyMap<string, DayType>;

/**
 * Bir günün maaş tipi — yalnızca o gün için kaydedilmiş İŞARETTEN.
 *
 * Eskiden burada "çalışma dönemi" aralıkları da vardı ve pazar/resmi tatil
 * çözümü okuma anında yapılıyordu. Aralık kavramı kaldırıldı: kullanıcı
 * takvimde gün gün işaretliyor ve işaret KAYDEDİLİRKEN çözülüyor (bkz.
 * dayTypeForMark) — "Çalıştı" denen bir pazar, pazar tipiyle saklanıyor.
 * Okuma tarafındaki çözüm bu yüzden ölü koda dönüşmüştü; aralık
 * parametresi de her çağrıda boş dizi geçiliyordu.
 *
 * İşaretsiz gün `null` döner ve maaşa hiç katılmaz.
 */
export function classifyDay(
  date: Date,
  dayExceptions?: DayExceptionMap
): DayType | null {
  return dayExceptions?.get(toDateKey(date)) ?? null;
}
