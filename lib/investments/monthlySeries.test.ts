import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { computeMonthlySeries, type PriceLookup } from "./monthlySeries";
import type { TransactionLike } from "./positions";

function tx(
  side: "BUY" | "SELL",
  quantity: string,
  pricePerUnit: string,
  tradedAt: string,
  symbol = "SOL"
): TransactionLike {
  return {
    symbol,
    assetType: "CRYPTO",
    currency: "USD",
    side,
    quantity,
    pricePerUnit,
    tradedAt: new Date(`${tradedAt}T00:00:00Z`),
  };
}

/** Kur çevrimi yapmayan basit toBase (1:1). */
const identity = (amount: Decimal) => amount;

/** Her ay için sabit fiyat döndüren arama fonksiyonu. */
const priceAlways = (price: string): PriceLookup => () => ({
  price: new Decimal(price),
  currency: "USD",
});

const noPrice: PriceLookup = () => null;

describe("computeMonthlySeries", () => {
  it("maliyeti ay sonundaki pozisyona göre hesaplar", () => {
    const points = computeMonthlySeries({
      transactions: [tx("BUY", "10", "100", "2026-01-15")],
      months: ["2026-01", "2026-02"],
      priceAt: priceAlways("120"),
      toBase: identity,
    });

    expect(points[0].costBasis).toBe(1000);
    expect(points[1].costBasis).toBe(1000); // sonraki ayda da elde duruyor
  });

  it("işlem yapılmadan önceki ayları sıfır gösterir", () => {
    const points = computeMonthlySeries({
      transactions: [tx("BUY", "10", "100", "2026-03-15")],
      months: ["2026-01", "2026-03"],
      priceAt: priceAlways("120"),
      toBase: identity,
    });

    expect(points[0].costBasis).toBe(0);
    expect(points[0].marketValue).toBe(0);
    expect(points[1].costBasis).toBe(1000);
  });

  it("piyasa değerini o ayın fiyatıyla hesaplar", () => {
    const points = computeMonthlySeries({
      transactions: [tx("BUY", "10", "100", "2026-01-15")],
      months: ["2026-01"],
      priceAt: priceAlways("120"),
      toBase: identity,
    });

    expect(points[0].marketValue).toBe(1200);
    expect(points[0].unrealizedPL).toBe(200);
    expect(points[0].totalPL).toBe(200);
  });

  it("fiyat verisi olmayan ayda piyasa değerini null bırakır", () => {
    // Bugünün fiyatını geçmişe uygulamaktansa boş bırakılır.
    const points = computeMonthlySeries({
      transactions: [tx("BUY", "10", "100", "2026-01-15")],
      months: ["2026-01"],
      priceAt: noPrice,
      toBase: identity,
    });

    expect(points[0].marketValue).toBeNull();
    expect(points[0].unrealizedPL).toBeNull();
    expect(points[0].totalPL).toBeNull();
    // maliyet yine de bilinir
    expect(points[0].costBasis).toBe(1000);
  });

  it("bir sembolün fiyatı eksikse o ayın toplam değerini null yapar", () => {
    const onlySol: PriceLookup = (symbol) =>
      symbol === "SOL" ? { price: new Decimal("120"), currency: "USD" } : null;

    const points = computeMonthlySeries({
      transactions: [
        tx("BUY", "10", "100", "2026-01-15", "SOL"),
        tx("BUY", "5", "200", "2026-01-20", "AAPL"),
      ],
      months: ["2026-01"],
      priceAt: onlySol,
      toBase: identity,
    });

    expect(points[0].marketValue).toBeNull();
    expect(points[0].costBasis).toBe(2000); // 1000 + 1000
  });

  it("satış sonrası gerçekleşen kâr/zararı biriktirir", () => {
    const points = computeMonthlySeries({
      transactions: [
        tx("BUY", "10", "100", "2026-01-15"),
        tx("SELL", "4", "150", "2026-02-10"),
      ],
      months: ["2026-01", "2026-02"],
      priceAt: priceAlways("120"),
      toBase: identity,
    });

    expect(points[0].realizedPL).toBe(0);
    expect(points[1].realizedPL).toBe(200); // (150-100)*4
    expect(points[1].costBasis).toBe(600); // kalan 6 × 100
    expect(points[1].marketValue).toBe(720); // 6 × 120
    expect(points[1].totalPL).toBe(320); // (720-600) + 200
  });

  it("pozisyon tamamen kapandığında değeri sıfır, gerçekleşeni korur", () => {
    const points = computeMonthlySeries({
      transactions: [
        tx("BUY", "10", "100", "2026-01-15"),
        tx("SELL", "10", "150", "2026-02-10"),
      ],
      months: ["2026-02"],
      priceAt: priceAlways("120"),
      toBase: identity,
    });

    expect(points[0].costBasis).toBe(0);
    expect(points[0].marketValue).toBe(0);
    expect(points[0].realizedPL).toBe(500);
    expect(points[0].totalPL).toBe(500);
  });

  it("baz para birimi çevrimini uygular", () => {
    const points = computeMonthlySeries({
      transactions: [tx("BUY", "10", "100", "2026-01-15")],
      months: ["2026-01"],
      priceAt: priceAlways("120"),
      // USD -> TRY 40x
      toBase: (amount, currency) =>
        currency === "USD" ? amount.mul(40) : amount,
    });

    expect(points[0].costBasis).toBe(40000);
    expect(points[0].marketValue).toBe(48000);
  });

  it("ay sonundan sonraki işlemleri o aya katmaz", () => {
    const points = computeMonthlySeries({
      transactions: [tx("BUY", "10", "100", "2026-02-01")],
      months: ["2026-01"],
      priceAt: priceAlways("120"),
      toBase: identity,
    });

    expect(points[0].costBasis).toBe(0);
  });
});
