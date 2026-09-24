import { toDateKeyUtc } from "@/lib/date/utc";

import type { DayType } from "./dailyFormula";
import type { DayExceptionMap } from "./holidayCalendar";
import { dayTypeForMark, type DayMark } from "./markDays";

/**
 * Test yardımcısı: bir tarih aralığını, UYGULAMANIN yaptığı gibi gün gün
 * işaretler.
 *
 * Testler eskiden "çalışma dönemi" aralıkları veriyordu; o kavram
 * kaldırıldı ve uygulama artık takvimde gün gün işaret yazıyor. Aralık
 * senaryolarını korumak ama canlı yolu test etmek için aralık burada
 * günlere açılıyor — tıpkı kullanıcı takvimde sürükleyip "Çalıştı"
 * dediğinde olduğu gibi (bkz. dayTypeForMark).
 *
 * Yalnızca testlerden içe aktarılır; uygulama kodu buraya dokunmaz.
 */
export function markRange(
  from: string,
  to: string,
  mark: DayMark,
  holidayDateKeys: ReadonlySet<string> = new Set(),
  into: Map<string, DayType> = new Map()
): Map<string, DayType> {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();

  for (let t = start; t <= end; t += MS_PER_DAY) {
    const day = new Date(t);
    into.set(toDateKeyUtc(day), dayTypeForMark(day, mark, holidayDateKeys));
  }
  return into;
}

/** Tek bir günü doğrudan bir tiple işaretler (kullanıcının elle seçmesi). */
export function markDay(
  date: string,
  dayType: DayType,
  into: Map<string, DayType> = new Map()
): Map<string, DayType> {
  into.set(date, dayType);
  return into;
}

export type { DayExceptionMap };
