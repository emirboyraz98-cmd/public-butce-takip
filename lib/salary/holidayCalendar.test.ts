import { describe, expect, it } from "vitest";

import { classifyDay, type WorkPeriodLike } from "./holidayCalendar";

describe("classifyDay", () => {
  const workedJan5to11: WorkPeriodLike = {
    startDate: new Date("2026-01-05T00:00:00Z"),
    endDate: new Date("2026-01-11T00:00:00Z"),
    type: "WORKED",
  };
  const leaveJan12to13: WorkPeriodLike = {
    startDate: new Date("2026-01-12T00:00:00Z"),
    endDate: new Date("2026-01-13T00:00:00Z"),
    type: "LEAVE",
  };
  const periods = [workedJan5to11, leaveJan12to13];
  const holidays = new Set(["2026-01-01"]);

  it("returns null for a day outside any period", () => {
    expect(classifyDay(new Date("2026-01-20T00:00:00Z"), periods, holidays)).toBeNull();
  });

  it("classifies a Sunday inside a WORKED period as SUNDAY", () => {
    // 2026-01-11 is a Sunday
    expect(
      classifyDay(new Date("2026-01-11T00:00:00Z"), periods, holidays)
    ).toBe("SUNDAY");
  });

  it("classifies a weekday inside a WORKED period as NORMAL", () => {
    expect(
      classifyDay(new Date("2026-01-05T00:00:00Z"), periods, holidays)
    ).toBe("NORMAL");
  });

  it("classifies a day inside a LEAVE period as LEAVE, even on a Sunday/holiday", () => {
    expect(
      classifyDay(new Date("2026-01-12T00:00:00Z"), periods, holidays)
    ).toBe("LEAVE");
  });

  it("classifies a public holiday inside a WORKED period as PUBLIC_HOLIDAY, overriding weekday", () => {
    const workedIncludingHoliday: WorkPeriodLike = {
      startDate: new Date("2025-12-30T00:00:00Z"),
      endDate: new Date("2026-01-02T00:00:00Z"),
      type: "WORKED",
    };
    expect(
      classifyDay(
        new Date("2026-01-01T00:00:00Z"),
        [workedIncludingHoliday],
        holidays
      )
    ).toBe("PUBLIC_HOLIDAY");
  });

  it("resmi tatile denk gelen pazarda PAZAR kazanır (daha yüksek ücret)", () => {
    // 2026-08-30 Zafer Bayramı ve aynı zamanda pazar. Pazar 22.5, resmi
    // tatil 18.75 ödüyor; çakıştığında yüksek olan uygulanmalı.
    const worked: WorkPeriodLike = {
      startDate: new Date("2026-08-24T00:00:00Z"),
      endDate: new Date("2026-08-31T00:00:00Z"),
      type: "WORKED",
    };
    expect(
      classifyDay(
        new Date("2026-08-30T00:00:00Z"),
        [worked],
        new Set(["2026-08-30"])
      )
    ).toBe("SUNDAY");
  });

  it("LEAVE takes priority over holiday classification", () => {
    const leaveIncludingHoliday: WorkPeriodLike = {
      startDate: new Date("2025-12-31T00:00:00Z"),
      endDate: new Date("2026-01-02T00:00:00Z"),
      type: "LEAVE",
    };
    expect(
      classifyDay(
        new Date("2026-01-01T00:00:00Z"),
        [leaveIncludingHoliday],
        holidays
      )
    ).toBe("LEAVE");
  });
});

describe("classifyDay — gün istisnaları", () => {
  const worked: WorkPeriodLike = {
    startDate: new Date("2026-08-01T00:00:00Z"),
    endDate: new Date("2026-08-31T00:00:00Z"),
    type: "WORKED",
  };
  const leave: WorkPeriodLike = {
    startDate: new Date("2026-08-01T00:00:00Z"),
    endDate: new Date("2026-08-31T00:00:00Z"),
    type: "LEAVE",
  };
  const noHolidays = new Set<string>();

  it("istisna, dönemin türünü geçersiz kılar", () => {
    // Bütün ay çalışıldı, ama 5 ağustos aslında izinliymiş.
    expect(
      classifyDay(
        new Date("2026-08-05T00:00:00Z"),
        [worked],
        noHolidays,
        new Map([["2026-08-05", "LEAVE" as const]])
      )
    ).toBe("LEAVE");
  });

  it("istisna, izin döneminde de çalışır (ters yön)", () => {
    expect(
      classifyDay(
        new Date("2026-08-05T00:00:00Z"),
        [leave],
        noHolidays,
        new Map([["2026-08-05", "NORMAL" as const]])
      )
    ).toBe("NORMAL");
  });

  it("istisna, pazar ve resmi tatilden de önce gelir", () => {
    // 2026-08-30 hem pazar hem Zafer Bayramı; istisna ikisini de yener.
    expect(
      classifyDay(
        new Date("2026-08-30T00:00:00Z"),
        [worked],
        new Set(["2026-08-30"]),
        new Map([["2026-08-30", "NORMAL" as const]])
      )
    ).toBe("NORMAL");
  });

  it("başka günlerin istisnası o güne sızmaz", () => {
    expect(
      classifyDay(
        new Date("2026-08-06T00:00:00Z"),
        [worked],
        noHolidays,
        new Map([["2026-08-05", "LEAVE" as const]])
      )
    ).toBe("NORMAL");
  });

  it("kapsamsız güne konan istisna o günü maaşa KATAR", () => {
    // Hiçbir döneme girmemiş bir günü takvimden düzeltebilmek asıl kullanım
    // senaryosu: "bu günü yanlışlıkla çalışıldıya koymamışım".
    expect(
      classifyDay(
        new Date("2026-08-05T00:00:00Z"),
        [],
        noHolidays,
        new Map([["2026-08-05", "NORMAL" as const]])
      )
    ).toBe("NORMAL");
  });

  it("istisnası olmayan kapsamsız gün yine hesaba girmez", () => {
    expect(
      classifyDay(
        new Date("2026-08-06T00:00:00Z"),
        [],
        noHolidays,
        new Map([["2026-08-05", "NORMAL" as const]])
      )
    ).toBeNull();
  });

  it("istisna verilmediğinde davranış değişmez", () => {
    expect(
      classifyDay(new Date("2026-08-05T00:00:00Z"), [worked], noHolidays)
    ).toBe("NORMAL");
  });
});
