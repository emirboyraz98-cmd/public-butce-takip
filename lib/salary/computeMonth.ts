import Decimal from "decimal.js";
import { eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";

import {
  dailyAmountUsd,
  hourlyRateFromBaseSalary,
  monthLengthAdjustmentDays,
  type DayType,
} from "./dailyFormula";
import {
  classifyDay,
  toDateKey,
  type DayExceptionMap,
  type WorkPeriodLike,
} from "./holidayCalendar";
import { findApplicableByPeriod } from "./effectiveRate";

export type BaseSalaryRateLike = {
  amount: Decimal | number | string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type DailyBreakdownEntry = {
  date: string;
  dayType: DayType;
  hourlyRateUsd: string;
  amountUsd: string;
};

export type MonthComputationResult = {
  month: string;
  usdNominalTotal: Decimal;
  breakdown: DailyBreakdownEntry[];
  /** Normal gün sayısı, ay uzunluğu düzeltmesi UYGULANMIŞ hâliyle. */
  dayTypeCounts: Record<DayType, number>;
  /** Ayı 30 güne getirmek için normal güne eklenen/çıkarılan gün (-1, 0, +1, +2). */
  monthLengthAdjustment: number;
  /** Bu düzeltmenin tutar karşılığı (negatif olabilir). */
  monthLengthAdjustmentUsd: Decimal;
};

function parseMonth(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1));
}

/**
 * Bir aya ait tüm günlerin nominal USD toplamını hesaplar (kur düzeltmesi
 * uygulanmadan önceki adım). Ay sınırını aşan çalışma/izin aralıkları, her
 * gün kendi takvim ayına dahil edilerek doğal olarak ele alınır çünkü
 * hesaplama gün gün, o günün tarihine göre yapılır.
 */
export function computeMonthNominal(
  month: string,
  workPeriods: WorkPeriodLike[],
  baseSalaryRates: BaseSalaryRateLike[],
  holidayDateKeys: ReadonlySet<string>,
  dayExceptions?: DayExceptionMap
): MonthComputationResult {
  const monthStart = parseMonth(month);
  const days = eachDayOfInterval({
    start: startOfMonth(monthStart),
    end: endOfMonth(monthStart),
  });

  const breakdown: DailyBreakdownEntry[] = [];
  const dayTypeCounts: Record<DayType, number> = {
    NORMAL: 0,
    SUNDAY: 0,
    PUBLIC_HOLIDAY: 0,
    LEAVE: 0,
  };
  let usdNominalTotal = new Decimal(0);

  for (const day of days) {
    const dayType = classifyDay(day, workPeriods, holidayDateKeys, dayExceptions);
    if (!dayType) continue;

    const rate = findApplicableByPeriod(day, baseSalaryRates);
    if (!rate) {
      throw new Error(
        `${toDateKey(day)} için geçerli bir baz maaş bulunamadı. Bu tarihi kapsayan bir Baz Maaş dönemi ekleyin.`
      );
    }

    const hourlyRate = hourlyRateFromBaseSalary(rate.amount);
    const amount = dailyAmountUsd(dayType, hourlyRate);

    usdNominalTotal = usdNominalTotal.plus(amount);
    dayTypeCounts[dayType] += 1;
    breakdown.push({
      date: toDateKey(day),
      dayType,
      hourlyRateUsd: hourlyRate.toFixed(4),
      amountUsd: amount.toFixed(2),
    });
  }

  // Bordro ayı her zaman 30 gün sayar. İzin ve resmi tatil günlerine
  // dokunulmaz; fark yalnızca normal çalışılan günden alınır/eklenir.
  //
  // Düzeltme SADECE ayın tamamı girilmişse uygulanır: bordronun mantığı
  // "izin + resmi tatil + normal = ayın tamamı" varsayımına dayanır. Ayın
  // yalnızca birkaç günü girildiyse ortada normalize edilecek bir ay yoktur;
  // orada gün eklemek/çıkarmak olmayan maaş uydurmak olurdu.
  const monthFullyCovered = breakdown.length === days.length;
  const adjustment = monthFullyCovered
    ? monthLengthAdjustmentDays(days.length, dayTypeCounts.NORMAL)
    : 0;
  let monthLengthAdjustmentUsd = new Decimal(0);

  if (adjustment !== 0) {
    const monthEnd = days[days.length - 1];
    const rate = findApplicableByPeriod(monthEnd, baseSalaryRates);
    if (rate) {
      const perNormalDay = dailyAmountUsd(
        "NORMAL",
        hourlyRateFromBaseSalary(rate.amount)
      );
      monthLengthAdjustmentUsd = perNormalDay.mul(adjustment);
      usdNominalTotal = usdNominalTotal.plus(monthLengthAdjustmentUsd);
      dayTypeCounts.NORMAL += adjustment;
    }
  }

  return {
    month,
    usdNominalTotal,
    breakdown,
    dayTypeCounts,
    monthLengthAdjustment: adjustment,
    monthLengthAdjustmentUsd,
  };
}
