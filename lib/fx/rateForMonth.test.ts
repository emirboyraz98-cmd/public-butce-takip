import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { rateForMonthWithFallback } from "./monthlyAverage";

const FALLBACK = new Decimal(50);

function rates(entries: Record<string, string>): Map<string, Decimal> {
  return new Map(
    Object.entries(entries).map(([month, value]) => [month, new Decimal(value)])
  );
}

describe("rateForMonthWithFallback", () => {
  it("ayın kendi kuru varsa onu kullanır", () => {
    const result = rateForMonthWithFallback(
      "2026-05",
      rates({ "2026-04": "38", "2026-05": "40", "2026-06": "42" }),
      FALLBACK
    );

    expect(result.rate.toString()).toBe("40");
    expect(result.isExact).toBe(true);
  });

  it("kuru olmayan ay için en son GEÇMİŞ ayın kuruna düşer", () => {
    // 2026-07 verisi yok; en yakın geçmiş 2026-05 olmalı (2026-08 değil).
    const result = rateForMonthWithFallback(
      "2026-07",
      rates({ "2026-03": "36", "2026-05": "40", "2026-08": "45" }),
      FALLBACK
    );

    expect(result.rate.toString()).toBe("40");
    expect(result.isExact).toBe(false);
  });

  it("gelecek ayları geçmişteki son kurla çevirir", () => {
    const result = rateForMonthWithFallback(
      "2027-01",
      rates({ "2026-07": "43", "2026-08": "44" }),
      FALLBACK
    );

    expect(result.rate.toString()).toBe("44");
    expect(result.isExact).toBe(false);
  });

  it("hiç geçmiş veri yoksa fallback kuru kullanır", () => {
    // Sadece gelecekteki aylar biliniyor; geçmişe bakacak veri yok.
    const result = rateForMonthWithFallback(
      "2026-01",
      rates({ "2026-05": "40" }),
      FALLBACK
    );

    expect(result.rate.toString()).toBe("50");
    expect(result.isExact).toBe(false);
  });

  it("kur tablosu tamamen boşsa fallback kullanır", () => {
    const result = rateForMonthWithFallback("2026-05", new Map(), FALLBACK);

    expect(result.rate.toString()).toBe("50");
    expect(result.isExact).toBe(false);
  });

  it("geçmiş ayları güncel kurla şişirmez", () => {
    // Asıl hata buydu: 2026-01'deki 1000 USD'yi bugünün 50 kuruyla
    // çevirmek 50.000 TL gösteriyordu; ayın kendi kuru 30 ise 30.000 olmalı.
    const { rate } = rateForMonthWithFallback(
      "2026-01",
      rates({ "2026-01": "30", "2026-08": "50" }),
      FALLBACK
    );

    expect(new Decimal(1000).mul(rate).toString()).toBe("30000");
  });
});
