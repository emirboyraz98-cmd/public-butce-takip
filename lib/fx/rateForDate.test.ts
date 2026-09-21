import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { rateForDate, type DailyRate } from "./dailyBase";

const FALLBACK = new Decimal(99);
const day = (iso: string, rate: number): DailyRate => ({
  date: new Date(`${iso}T00:00:00Z`),
  usdTry: new Decimal(rate),
});

// Cuma, pazartesi, salı — hafta sonu TCMB kur yayımlamaz.
const archive = [
  day("2026-06-05", 40),
  day("2026-06-08", 41),
  day("2026-06-09", 42),
];

describe("rateForDate", () => {
  it("o günün kurunu kullanır", () => {
    const r = rateForDate(new Date("2026-06-08T00:00:00Z"), archive, FALLBACK);
    expect(r.usdTry.toString()).toBe("41");
    expect(r.source).toBe("exact");
  });

  it("hafta sonunda en yakın ÖNCEKİ güne düşer", () => {
    // Cumartesi 6 Haziran: doğru karşılık cumanın kuru.
    const r = rateForDate(new Date("2026-06-06T00:00:00Z"), archive, FALLBACK);
    expect(r.usdTry.toString()).toBe("40");
    expect(r.source).toBe("earlier");
  });

  it("arşivin sonundan sonrası için son günü kullanır", () => {
    const r = rateForDate(new Date("2026-07-01T00:00:00Z"), archive, FALLBACK);
    expect(r.usdTry.toString()).toBe("42");
    expect(r.source).toBe("earlier");
  });

  it("arşivden ESKİ işlemde en yakın sonraki güne düşer", () => {
    // Bugünün kuruna düşmektense arşivin en eski günü daha yakın.
    const r = rateForDate(new Date("2026-01-15T00:00:00Z"), archive, FALLBACK);
    expect(r.usdTry.toString()).toBe("40");
    expect(r.source).toBe("later");
  });

  it("arşiv boşsa fallback kullanır", () => {
    const r = rateForDate(new Date("2026-06-08T00:00:00Z"), [], FALLBACK);
    expect(r.usdTry.toString()).toBe("99");
    expect(r.source).toBe("fallback");
  });

  it("aynı tarih için her zaman aynı kuru verir", () => {
    const d = new Date("2026-06-06T00:00:00Z");
    expect(rateForDate(d, archive, FALLBACK).usdTry.toString()).toBe(
      rateForDate(d, archive, new Decimal(1)).usdTry.toString()
    );
  });
});
