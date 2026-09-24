/**
 * Takvim aritmetiğinin UTC tabanı.
 *
 * date-fns'in `startOfMonth`, `eachDayOfInterval`, `getDay`, `format` gibi
 * fonksiyonları ÇALIŞTIĞI MAKİNENİN saat dilimine göre davranır. Maaş
 * takvimi ise ayları `Date.UTC` ile kuruyordu; ikisi karışınca UTC'nin
 * batısındaki bir tarayıcıda "2026-08" isteyip 2026-07'nin günleri
 * dönüyordu — takvim istemci bileşeni olduğu için sonucu BAKAN KİŞİNİN
 * saat dilimi belirliyordu.
 *
 * Buradaki fonksiyonların hiçbiri yerel saate bakmaz: bir gün, nerede
 * açılırsa açılsın aynı gündür.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `2026-08` -> ayın ilk günü, UTC gece yarısı. */
export function monthStartUtc(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1));
}

/** `2026-08` -> ayın son günü, UTC gece yarısı. */
export function monthEndUtc(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  // Bir sonraki ayın 0. günü = bu ayın son günü.
  return new Date(Date.UTC(year, monthNum, 0));
}

/** Ayın bütün günleri, UTC gece yarısı damgalı. */
export function daysOfMonthUtc(month: string): Date[] {
  const start = monthStartUtc(month);
  const end = monthEndUtc(month);
  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    days.push(new Date(t));
  }
  return days;
}

/** `yyyy-MM-dd` — yerel saatten bağımsız. */
export function toDateKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `yyyy-MM` — yerel saatten bağımsız. */
export function toMonthKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** 0 = Pazar, 1 = Pazartesi … 6 = Cumartesi. */
export function dayOfWeekUtc(date: Date): number {
  return date.getUTCDay();
}

export function isSundayUtc(date: Date): boolean {
  return dayOfWeekUtc(date) === 0;
}

/** Hafta içi mi (Pazartesi–Cuma). */
export function isWeekdayUtc(date: Date): boolean {
  const day = dayOfWeekUtc(date);
  return day !== 0 && day !== 6;
}

/**
 * Tarih, aralığın içinde mi — GÜN hassasiyetinde, iki uç da dahil.
 *
 * Saat bileşenleri kırpılıyor: `endDate` gece yarısı damgalıyken aynı günün
 * öğleni "aralık dışı" sayılıyordu.
 */
export function isWithinDayIntervalUtc(
  date: Date,
  start: Date,
  end: Date
): boolean {
  const key = toDateKeyUtc(date);
  return key >= toDateKeyUtc(start) && key <= toDateKeyUtc(end);
}

/** `2026-08` + 3 -> `2026-11`. Negatif değer geriye gider. */
export function addMonthsToKey(month: string, count: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNum - 1 + count, 1));
  return toMonthKeyUtc(shifted);
}
