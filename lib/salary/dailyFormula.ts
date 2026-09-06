import Decimal from "decimal.js";

export type DayType = "NORMAL" | "SUNDAY" | "PUBLIC_HOLIDAY" | "LEAVE";

/**
 * Katsayı × saatlik ücret = günlük tutar (USD).
 * Pazar:        7.5×2.5 + 2.5×1.5 = 22.5
 * Normal Gün:   7.5×1   + 2.5×1.5 = 11.25
 * Resmi Tatil:  7.5×2   + 2.5×1.5 = 18.75
 * İzinli:       7.5×1                = 7.5  (= baz maaş / 30)
 */
export const DAY_TYPE_COEFFICIENTS: Record<DayType, number> = {
  NORMAL: 11.25,
  SUNDAY: 22.5,
  PUBLIC_HOLIDAY: 18.75,
  LEAVE: 7.5,
};

/**
 * Bordronun kabul ettiği standart ay: 30 gün × 7,5 saat = 225 saat.
 * Ayın takvimdeki gün sayısı ne olursa olsun bu taban değişmez.
 */
export const STANDARD_MONTH_DAYS = 30;
export const STANDARD_MONTH_HOURS = 225;

export function hourlyRateFromBaseSalary(
  baseSalaryUsd: Decimal | number | string
): Decimal {
  return new Decimal(baseSalaryUsd).div(STANDARD_MONTH_HOURS);
}

/**
 * Ayı 30 güne normalize etmek için normal çalışma gününe uygulanacak fark.
 *
 * Bordroda ay her zaman 30 gün sayılır; izin ve resmi tatil gün sayılarına
 * dokunulmaz, fark yalnızca normal çalışılan günden alınır ya da eklenir:
 *   31 gün -> -1, 30 gün -> 0, 29 gün -> +1, 28 gün -> +2
 *
 * `normalDayCount` verilirse, elde olandan fazla gün düşülmez (negatife
 * inmez); örneğin 31 günlük ayın tamamı izinliyse çıkarılacak normal gün
 * yoktur ve düzeltme uygulanmaz.
 */
export function monthLengthAdjustmentDays(
  daysInMonth: number,
  normalDayCount?: number
): number {
  const raw = STANDARD_MONTH_DAYS - daysInMonth;
  if (raw >= 0 || normalDayCount === undefined) return raw;
  const clamped = Math.max(raw, -normalDayCount);
  // Math.max(-1, -0) === -0; eksi sıfırın veriye/arayüze sızmaması için sadeleştir.
  return clamped === 0 ? 0 : clamped;
}

export function dailyAmountUsd(
  dayType: DayType,
  hourlyRate: Decimal | number
): Decimal {
  return new Decimal(hourlyRate).mul(DAY_TYPE_COEFFICIENTS[dayType]);
}
