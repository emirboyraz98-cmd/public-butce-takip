"use client";

import { useMemo, useState } from "react";

import type { DayType } from "@/lib/salary/dailyFormula";
import { buildMonthCalendar, monthLabel } from "@/lib/salary/monthCalendar";
import { SalaryMonthCalendar } from "./month-calendar";

/**
 * Takvim, ay gezinmesiyle birlikte tek görünüm — ve artık çalışma günü
 * girişinin TEK yolu.
 *
 * Aylar önce sunucuda hazır hesaplanıp geliyordu; liste yalnızca maaş sonucu
 * OLAN ayları içerdiğinden hiç veri girmemiş bir kullanıcı takvimi hiç
 * göremiyordu — ve takvim tek giriş yolu olunca bu kilitlenme demekti.
 * Sınıflandırma saf bir fonksiyon olduğu için ay burada, istemcide
 * kuruluyor: sunucudan yalnızca ham veri (tatiller + işaretli günler)
 * geliyor, karşılığında her yöne sınırsız gezinme var.
 */
export type FixedRange = {
  /** yyyy-MM */
  from: string;
  /** yyyy-MM; null ise açık uçlu. */
  to: string | null;
};

export function SalaryCalendarCard({
  holidayDates,
  markedDays,
  adjustments,
  fixedRanges,
  today,
  initialMonth,
}: {
  /** Resmi tatiller (yyyy-MM-dd). */
  holidayDates: string[];
  /** İşaretli günler: [yyyy-MM-dd, tip]. */
  markedDays: [string, DayType][];
  /** Ayı 30 güne getiren düzeltme — yalnızca hesaplanmış aylar için. */
  adjustments: Record<string, number>;
  /** Sabit maaş dönemleri; bu aylarda gün işaretlemek maaşı değiştirmez. */
  fixedRanges: FixedRange[];
  /** yyyy-MM-dd — sunucudan gelir; istemcide üretmek hidrasyonu bozar. */
  today: string;
  /** yyyy-MM — açılışta gösterilecek ay. */
  initialMonth: string;
}) {
  const [month, setMonth] = useState(initialMonth);

  const holidayDateKeys = useMemo(
    () => new Set(holidayDates),
    [holidayDates]
  );
  const dayExceptions = useMemo(() => new Map(markedDays), [markedDays]);

  const calendar = useMemo(
    () =>
      buildMonthCalendar({
        month,
        // Aralık kavramı kaldırıldı: gün tipleri yalnızca işaretli günlerden.
        periods: [],
        holidayDateKeys,
        dayExceptions,
      }),
    [month, holidayDateKeys, dayExceptions]
  );

  const missing = calendar.uncovered.length;
  const marked = calendar.days.length - missing;
  /*
   * Sabit bir ayda maaş, döneme girilen tutardan geliyor; günler hesaba hiç
   * girmiyor. Takvim yine de açık kalıyor (kullanıcı komşu ayları düzeltmek
   * için buradan geçiyor) ama bunu söylemeden bırakmak, işaretlediği günler
   * tutarı değiştirmeyince sessiz bir yanlış anlaşılma olurdu.
   */
  const isFixedMonth = fixedRanges.some(
    (r) => month >= r.from && (r.to === null || month <= r.to)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Önceki ay"
          className="border-border hover:bg-muted min-h-11 border px-3 text-[14px] font-bold sm:min-h-9"
        >
          ◄
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-[15px] font-extrabold">
            {monthLabel(month)}
          </p>
          <p className="text-[11px]">
            {isFixedMonth ? (
              <span className="text-accent-text font-semibold">sabit ay</span>
            ) : marked === 0 ? (
              <span className="text-destructive font-semibold">
                hiçbir gün işaretlenmemiş
              </span>
            ) : missing > 0 ? (
              <span className="text-destructive font-semibold">
                {missing} gün işaretsiz
              </span>
            ) : (
              <span className="text-muted-foreground">ay tamam</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Sonraki ay"
          className="border-border hover:bg-muted min-h-11 border px-3 text-[14px] font-bold sm:min-h-9"
        >
          ►
        </button>
      </div>

      {/* Gezinme sınırsız olunca kaybolmak da mümkün; dönüş yolu hep açık. */}
      {month !== initialMonth && (
        <button
          type="button"
          onClick={() => setMonth(initialMonth)}
          className="text-accent-text w-full text-center text-[12px] font-semibold underline underline-offset-4"
        >
          {monthLabel(initialMonth)} ayına dön
        </button>
      )}

      {isFixedMonth && (
        <p className="border-accent-text text-foreground border px-3 py-2 text-[12px] leading-snug">
          <strong>{monthLabel(month)} sabit bir maaş döneminde.</strong> Bu ayın
          maaşı Maaş ayarları&apos;ndaki dönem tutarından geliyor; buradaki gün
          işaretleri tutarı değiştirmez, yalnızca kayıt olarak durur.
        </p>
      )}

      <SalaryMonthCalendar
        key={month}
        calendar={calendar}
        monthLengthAdjustment={adjustments[month] ?? 0}
        today={today}
      />
    </div>
  );
}

/** "2026-10" + 1 → "2026-11". */
function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
