import { format, getDay, isWithinInterval } from "date-fns";

import type { DayType } from "./dailyFormula";

export type WorkPeriodLike = {
  startDate: Date;
  endDate: Date;
  type: "WORKED" | "LEAVE";
};

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isSunday(date: Date): boolean {
  return getDay(date) === 0;
}

/** Gün bazlı elle düzeltmeler: yyyy-MM-dd -> gün tipi. */
export type DayExceptionMap = ReadonlyMap<string, DayType>;

/**
 * Gün tipi sınıflandırması (öncelik sırasıyla):
 * 1. O gün için elle istisna girilmişse -> istisnadaki tip
 * 2. Hiçbir aralığa düşmüyorsa -> null (hesaplamaya dahil edilmez)
 * 3. İzin aralığına düşüyorsa -> İzinli (haftanın günü/tatil olması önemsiz)
 * 4. Çalışıldı aralığına düşüyor ve Pazar ise -> Pazar
 * 5. Çalışıldı aralığına düşüyor ve resmi tatilse -> Resmi Tatil
 * 6. Çalışıldı aralığına düşüyor (diğer) -> Normal Gün
 *
 * Pazar, resmi tatilden önce gelir: resmi tatile denk gelen bir pazarda
 * çalışıldıysa gün pazar ücretinden (22.5) ödenir, tatil ücretinden (18.75)
 * değil. İkisi çakıştığında daha yüksek olan kazanır.
 *
 * İstisna kapsam kontrolünden ÖNCE gelir, yani hiçbir döneme düşmeyen bir
 * günü de tek başına maaşa katabilir. Bu kasıtlı: en sık düzeltme ihtiyacı
 * tam olarak "bu günü yanlışlıkla hiçbir döneme koymamışım" durumunda
 * doğuyor ve takvimde o günü görüp oracıkta düzeltebilmek gerekiyor.
 * Sessiz bir dahil etme değil — kullanıcı günü kendisi seçiyor ve takvimde
 * elle değiştirildiği işaretli kalıyor.
 */
export function classifyDay(
  date: Date,
  periods: WorkPeriodLike[],
  holidayDateKeys: ReadonlySet<string>,
  dayExceptions?: DayExceptionMap
): DayType | null {
  const override = dayExceptions?.get(toDateKey(date));
  if (override) return override;

  const covering = periods.find((p) =>
    isWithinInterval(date, { start: p.startDate, end: p.endDate })
  );

  if (!covering) return null;

  if (covering.type === "LEAVE") return "LEAVE";

  if (isSunday(date)) return "SUNDAY";
  if (holidayDateKeys.has(toDateKey(date))) return "PUBLIC_HOLIDAY";
  return "NORMAL";
}
