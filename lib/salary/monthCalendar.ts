import {
  dayOfWeekUtc,
  daysOfMonthUtc,
  monthStartUtc,
} from "@/lib/date/utc";

import type { DayType } from "./dailyFormula";
import {
  classifyDay,
  toDateKey,
  type DayExceptionMap,
} from "./holidayCalendar";

/**
 * Bir ayın gün gün dökümü — maaş hesabının gördüğü hâliyle.
 *
 * Sınıflandırma yeniden yazılmaz, hesaplamanın kullandığı `classifyDay`
 * çağrılır. Ayrı bir renklendirme mantığı yazılsaydı takvim bir şey
 * gösterirken maaş başka bir şey hesaplayabilirdi; bu, takvimin hiç
 * olmamasından kötü olurdu.
 *
 * `dayType: null` = gün takvimde hiç işaretlenmemiş. Hesaplama bu günleri
 * sessizce atlıyor (computeMonth içinde `continue`), yani kullanıcı bir
 * aralığı eksik işaretlediyse hiçbir uyarı almadan para kaybediyor. Takvimin
 * asıl varlık sebebi bu günleri görünür kılmak.
 */

export type CalendarDay = {
  /** yyyy-MM-dd */
  date: string;
  /** Ayın günü (1-31). */
  dayOfMonth: number;
  /** Pazartesi = 0 … Pazar = 6. Izgarada sütunu belirler. */
  weekdayIndex: number;
  /** null ise gün takvimde işaretlenmemiş. */
  dayType: DayType | null;
  /** Resmi tatil mi (izinli olsa bile bilgi olarak gösterilir). */
  isHoliday: boolean;
  /**
   * Günün kendi kaydı var mı. Takvim tek kaynak olduğundan bu, `dayType`
   * null olmamasıyla aynı şeye çıkıyor; alan API uyumu için duruyor.
   */
  isException: boolean;
};

export type MonthCalendar = {
  /** yyyy-MM */
  month: string;
  days: CalendarDay[];
  /** İlk günden önce ızgarada bırakılacak boş kutu sayısı. */
  leadingBlanks: number;
  /** Hiç işaretlenmemiş günler (yyyy-MM-dd). */
  uncovered: string[];
  counts: Record<DayType, number> & { UNCOVERED: number };
};

/** Pazar = 0 gelir; ızgara pazartesiyle başladığı için kaydırılır. */
function mondayFirstIndex(date: Date): number {
  return (dayOfWeekUtc(date) + 6) % 7;
}

export function buildMonthCalendar({
  month,
  holidayDateKeys,
  dayExceptions,
}: {
  month: string;
  holidayDateKeys: ReadonlySet<string>;
  dayExceptions?: DayExceptionMap;
}): MonthCalendar {
  const dates = daysOfMonthUtc(month);

  const counts = {
    NORMAL: 0,
    SUNDAY: 0,
    PUBLIC_HOLIDAY: 0,
    LEAVE: 0,
    UNCOVERED: 0,
  };
  const uncovered: string[] = [];

  const days = dates.map((date): CalendarDay => {
    const key = toDateKey(date);
    const dayType = classifyDay(date, dayExceptions);

    if (dayType) counts[dayType] += 1;
    else {
      counts.UNCOVERED += 1;
      uncovered.push(key);
    }

    return {
      date: key,
      dayOfMonth: date.getUTCDate(),
      weekdayIndex: mondayFirstIndex(date),
      dayType,
      isHoliday: holidayDateKeys.has(key),
      isException: dayExceptions?.has(key) === true,
    };
  });

  return {
    month,
    days,
    leadingBlanks: days[0]?.weekdayIndex ?? 0,
    uncovered,
    counts,
  };
}

/** "2026-08" → "Ağustos 2026". Ay seçicide okunur etiket için. */
export function monthLabel(month: string): string {
  const date = monthStartUtc(month);
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Gün türlerinin arayüzdeki adı ve kutu içi etiketi.
 *
 * Kutu içinde tek harf (N/P/T/İ) yazıyordu ve hiçbir şey ifade etmiyordu:
 * takvime bakan kişi harfi açıklama listesiyle eşleştirmek zorundaydı. Kısa
 * kelime bir gün kutusuna sığıyor ve tek başına okunuyor.
 */
export const DAY_TYPE_LABELS: Record<
  DayType | "UNCOVERED",
  { label: string; short: string }
> = {
  NORMAL: { label: "Normal gün", short: "Çalıştı" },
  SUNDAY: { label: "Pazar", short: "Pazar" },
  PUBLIC_HOLIDAY: { label: "Resmi tatil", short: "Tatil" },
  LEAVE: { label: "İzin", short: "İzin" },
  UNCOVERED: { label: "İşaretsiz", short: "Boş" },
};
