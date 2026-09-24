import { describe, expect, it } from "vitest";

import {
  addMonthsToKey,
  dayOfWeekUtc,
  daysOfMonthUtc,
  isSundayUtc,
  isWeekdayUtc,
  isWithinDayIntervalUtc,
  monthEndUtc,
  monthStartUtc,
  toDateKeyUtc,
  toMonthKeyUtc,
} from "./utc";

/*
 * Bu testler saat diliminden bağımsız olmalı. Paket TZ=UTC ile de,
 * TZ=America/Los_Angeles ile de aynı sonucu vermeli — zaten korunan şey bu.
 */
describe("UTC tarih tabanı", () => {
  it("ayın ilk ve son gününü verir", () => {
    expect(toDateKeyUtc(monthStartUtc("2026-08"))).toBe("2026-08-01");
    expect(toDateKeyUtc(monthEndUtc("2026-08"))).toBe("2026-08-31");
  });

  it("artık yılı bilir", () => {
    expect(toDateKeyUtc(monthEndUtc("2024-02"))).toBe("2024-02-29");
    expect(toDateKeyUtc(monthEndUtc("2026-02"))).toBe("2026-02-28");
  });

  it("ayın bütün günlerini üretir", () => {
    const days = daysOfMonthUtc("2026-08");
    expect(days).toHaveLength(31);
    expect(toDateKeyUtc(days[0])).toBe("2026-08-01");
    expect(toDateKeyUtc(days[30])).toBe("2026-08-31");
  });

  it("30 günlük ayı 30 gün sayar", () => {
    expect(daysOfMonthUtc("2026-09")).toHaveLength(30);
  });

  it("haftanın gününü UTC'den okur", () => {
    // 2026-09-06 pazar.
    expect(dayOfWeekUtc(new Date("2026-09-06T00:00:00Z"))).toBe(0);
    expect(isSundayUtc(new Date("2026-09-06T00:00:00Z"))).toBe(true);
    expect(isSundayUtc(new Date("2026-09-07T00:00:00Z"))).toBe(false);
    expect(isWeekdayUtc(new Date("2026-09-05T00:00:00Z"))).toBe(false); // cumartesi
    expect(isWeekdayUtc(new Date("2026-09-07T00:00:00Z"))).toBe(true);
  });

  it("ay anahtarını verir", () => {
    expect(toMonthKeyUtc(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08");
  });

  it("aralığı gün hassasiyetinde, iki uç dahil değerlendirir", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    const end = new Date("2026-08-31T00:00:00Z");
    expect(isWithinDayIntervalUtc(start, start, end)).toBe(true);
    expect(isWithinDayIntervalUtc(end, start, end)).toBe(true);
    // Son günün öğleni de o güne aittir.
    expect(
      isWithinDayIntervalUtc(new Date("2026-08-31T12:00:00Z"), start, end)
    ).toBe(true);
    expect(
      isWithinDayIntervalUtc(new Date("2026-09-01T00:00:00Z"), start, end)
    ).toBe(false);
  });

  it("ay anahtarını kaydırır", () => {
    expect(addMonthsToKey("2026-08", 3)).toBe("2026-11");
    expect(addMonthsToKey("2026-11", 3)).toBe("2027-02");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
  });
});
