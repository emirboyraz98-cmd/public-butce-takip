import { describe, expect, it } from "vitest";

import { buildMonthCalendar, monthLabel } from "./monthCalendar";
import type { WorkPeriodLike } from "./holidayCalendar";
import type { DayType } from "./dailyFormula";

const period = (
  start: string,
  end: string,
  type: "WORKED" | "LEAVE"
): WorkPeriodLike => ({
  startDate: new Date(`${start}T00:00:00Z`),
  endDate: new Date(`${end}T00:00:00Z`),
  type,
});

const build = (
  periods: WorkPeriodLike[],
  holidays: string[] = [],
  month = "2026-08"
) =>
  buildMonthCalendar({
    month,
    periods,
    holidayDateKeys: new Set(holidays),
  });

describe("buildMonthCalendar", () => {
  it("ayın bütün günlerini üretir", () => {
    const cal = build([period("2026-08-01", "2026-08-31", "WORKED")]);
    expect(cal.days).toHaveLength(31);
    expect(cal.days[0].date).toBe("2026-08-01");
    expect(cal.days[30].date).toBe("2026-08-31");
  });

  it("pazarları ayırır", () => {
    const cal = build([period("2026-08-01", "2026-08-31", "WORKED")]);
    // 2026-08-02 pazar
    const sunday = cal.days.find((d) => d.date === "2026-08-02");
    expect(sunday?.dayType).toBe("SUNDAY");
    expect(cal.days.find((d) => d.date === "2026-08-03")?.dayType).toBe("NORMAL");
  });

  it("resmi tatile denk gelen pazarı pazar sayar", () => {
    const cal = build(
      [period("2026-08-01", "2026-08-31", "WORKED")],
      ["2026-08-30"] // Zafer Bayramı, 2026'da pazar
    );
    const day = cal.days.find((d) => d.date === "2026-08-30");
    // Ücret pazar üzerinden (22.5) ödenir; tatil bilgisi yine de taşınır.
    expect(day?.dayType).toBe("SUNDAY");
    expect(day?.isHoliday).toBe(true);
  });

  it("hafta içine düşen resmi tatili tatil sayar", () => {
    const cal = build(
      [period("2026-08-01", "2026-08-31", "WORKED")],
      ["2026-08-19"] // çarşamba
    );
    expect(cal.days.find((d) => d.date === "2026-08-19")?.dayType).toBe(
      "PUBLIC_HOLIDAY"
    );
  });

  it("izin, tatil ve pazarı bastırır", () => {
    const cal = build(
      [period("2026-08-01", "2026-08-31", "LEAVE")],
      ["2026-08-30"]
    );
    expect(cal.days.every((d) => d.dayType === "LEAVE")).toBe(true);
    // Tatil bilgisi yine de taşınır; arayüz "izinli ama resmi tatil" diyebilir.
    expect(cal.days.find((d) => d.date === "2026-08-30")?.isHoliday).toBe(true);
  });

  it("hiçbir döneme girmeyen günleri işaretler ve listeler", () => {
    // 12-14 ağustos hiçbir dönemde yok
    const cal = build([
      period("2026-08-01", "2026-08-11", "WORKED"),
      period("2026-08-15", "2026-08-31", "WORKED"),
    ]);

    expect(cal.uncovered).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
    expect(cal.counts.UNCOVERED).toBe(3);
    expect(cal.days.find((d) => d.date === "2026-08-13")?.dayType).toBeNull();
  });

  it("hiç dönem yoksa ayın tamamı kapsamsızdır", () => {
    const cal = build([]);
    expect(cal.counts.UNCOVERED).toBe(31);
    expect(cal.uncovered).toHaveLength(31);
  });

  it("gün tiplerini sayar", () => {
    const cal = build([
      period("2026-08-01", "2026-08-15", "WORKED"),
      period("2026-08-16", "2026-08-31", "LEAVE"),
    ]);

    const total =
      cal.counts.NORMAL +
      cal.counts.SUNDAY +
      cal.counts.PUBLIC_HOLIDAY +
      cal.counts.LEAVE +
      cal.counts.UNCOVERED;
    expect(total).toBe(31);
    expect(cal.counts.LEAVE).toBe(16);
  });

  it("ızgara pazartesiyle başlar", () => {
    // 2026-08-01 cumartesi → pazartesi-ilk indekste 5
    const cal = build([period("2026-08-01", "2026-08-31", "WORKED")]);
    expect(cal.days[0].weekdayIndex).toBe(5);
    expect(cal.leadingBlanks).toBe(5);

    // 2026-06-01 pazartesi → 0
    const june = build([period("2026-06-01", "2026-06-30", "WORKED")], [], "2026-06");
    expect(june.leadingBlanks).toBe(0);
  });

  it("ay dışındaki dönemler günleri kapsamaz", () => {
    const cal = build([period("2026-07-01", "2026-07-31", "WORKED")]);
    expect(cal.counts.UNCOVERED).toBe(31);
  });
});

describe("monthLabel", () => {
  it("ayı türkçe adıyla yazar", () => {
    expect(monthLabel("2026-08")).toBe("Ağustos 2026");
    expect(monthLabel("2026-01")).toBe("Ocak 2026");
  });

  it("negatif saat diliminde ayı geriye kaydırmaz", () => {
    // Tarih UTC'de ayın ilk günü; etiket yerel saatle biçimlenseydi
    // negatif ofsetli bir makinede önceki aya düşerdi. TZ=America/Los_Angeles
    // ile çalıştırıldığında da geçmesi gerekir.
    expect(monthLabel("2026-03")).toBe("Mart 2026");
    expect(monthLabel("2026-12")).toBe("Aralık 2026");
  });
});

/**
 * Yeni sözleşme: takvim yalnızca işaretli günlerden kuruluyor, aralık
 * kavramı arayüzden kaldırıldı. Bu blok o yolun tek başına çalıştığını
 * sabitliyor — `periods: []` gerçek çağrının aynısı.
 */
describe("buildMonthCalendar — yalnızca işaretli günler", () => {
  const buildMarked = (marks: Record<string, DayType>, holidays: string[] = []) =>
    buildMonthCalendar({
      month: "2026-08",
      periods: [],
      holidayDateKeys: new Set(holidays),
      dayExceptions: new Map(Object.entries(marks)),
    });

  it("işaretsiz ay tamamen boş sayılır", () => {
    const cal = buildMarked({});
    expect(cal.uncovered).toHaveLength(31);
    expect(cal.counts.NORMAL).toBe(0);
    expect(cal.days.every((d) => d.dayType === null)).toBe(true);
  });

  it("yalnızca işaretli günler sayılır, kalanı boş kalır", () => {
    const cal = buildMarked({
      "2026-08-03": "NORMAL",
      "2026-08-02": "SUNDAY",
      "2026-08-21": "LEAVE",
    });
    expect(cal.counts.NORMAL).toBe(1);
    expect(cal.counts.SUNDAY).toBe(1);
    expect(cal.counts.LEAVE).toBe(1);
    expect(cal.uncovered).toHaveLength(28);
  });

  it("işaret, o günün resmi tatil olmasından bağımsız", () => {
    // Kullanıcı tatili bilerek normal gün işaretlediyse öyle kalır;
    // dayTypeForMark yalnızca "Çalışıldı"da otomatik ayrım yapar.
    const cal = buildMarked({ "2026-08-30": "NORMAL" }, ["2026-08-30"]);
    const day = cal.days.find((d) => d.date === "2026-08-30");
    expect(day?.dayType).toBe("NORMAL");
    expect(day?.isHoliday).toBe(true);
  });
});
