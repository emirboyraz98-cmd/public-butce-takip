import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { realizedSales } from "./positions";
import { computeMonthlySeries } from "./monthlySeries";
import { monthlyInvestmentFlows } from "./cashFlow";

/**
 * Geçmişte kapanmış bir işlemin kârı, hiçbir kayıt değişmese bile kur
 * oynadıkça değişiyordu. Kullanıcı bunu az önce girdiği kaydın yaptığını
 * sanıyordu. Buradaki testler o sızıntıyı kapalı tutuyor.
 */

const tx = (
  date: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number,
  currency = "USD"
) => ({
  symbol: "NVDA",
  assetType: "STOCK" as const,
  side,
  quantity: new Decimal(qty),
  pricePerUnit: new Decimal(price),
  currency,
  tradedAt: new Date(`${date}T00:00:00Z`),
  createdAt: new Date(`${date}T00:00:00Z`),
});

// 100 adet 100$'dan alınıp 130$'dan satıldı → 3.000 USD gerçekleşen kâr.
const trades = [tx("2026-04-10", "BUY", 100, 100), tx("2026-06-20", "SELL", 100, 130)];

describe("realizedSales", () => {
  it("her satışı kendi tarihi ve para birimiyle verir", () => {
    const sales = realizedSales(trades);
    expect(sales).toHaveLength(1);
    expect(sales[0].amount.toString()).toBe("3000");
    expect(sales[0].currency).toBe("USD");
    expect(sales[0].tradedAt.toISOString().slice(0, 10)).toBe("2026-06-20");
  });

  it("satılmayan pozisyon için satış olayı üretmez", () => {
    expect(realizedSales([tx("2026-04-10", "BUY", 100, 100)])).toHaveLength(0);
  });

  it("her satışı ayrı ayrı verir", () => {
    const sales = realizedSales([
      tx("2026-04-10", "BUY", 100, 100),
      tx("2026-05-01", "SELL", 40, 120),
      tx("2026-06-20", "SELL", 60, 130),
    ]);
    expect(sales.map((s) => s.amount.toString())).toEqual(["800", "1800"]);
  });
});

describe("gerçekleşen K/Z kur oynayınca sabit kalır", () => {
  // Satış günü kuru 40; "bugünkü" kur ne olursa olsun sonuç değişmemeli.
  const onSaleDay = (amount: Decimal, currency: string) =>
    currency === "USD" ? amount.mul(40) : amount;

  const seriesWith = (todayRate: number) =>
    computeMonthlySeries({
      transactions: trades,
      months: ["2026-06", "2026-07"],
      priceAt: () => null,
      toBase: (amount, currency) =>
        currency === "USD" ? amount.mul(todayRate) : amount,
      toBaseOnDate: onSaleDay,
    });

  it("bugünkü kur değişse de birikimli K/Z aynı kalır", () => {
    const before = seriesWith(40);
    const after = seriesWith(40.4333);
    expect(before.map((p) => p.realizedPL)).toEqual(after.map((p) => p.realizedPL));
  });

  it("satış gününün kuruyla çevirir", () => {
    // 3.000 USD × 40 = 120.000 TRY
    expect(seriesWith(99).find((p) => p.month === "2026-06")!.realizedPL).toBe(
      120000
    );
  });

  it("toBaseOnDate verilmezse eski davranışı korur", () => {
    const legacy = computeMonthlySeries({
      transactions: trades,
      months: ["2026-06"],
      priceAt: () => null,
      toBase: (amount, currency) => (currency === "USD" ? amount.mul(50) : amount),
    });
    expect(legacy[0].realizedPL).toBe(150000);
  });
});

describe("aylık realize K/Z", () => {
  // Kur ay ay değişiyor; satış yalnızca haziranda.
  const rateByMonth: Record<string, number> = {
    "2026-06": 40,
    "2026-07": 45,
    "2026-08": 50,
  };
  const toBase = (amount: Decimal, currency: string, month: string) =>
    currency === "USD" ? amount.mul(rateByMonth[month] ?? 1) : amount;

  const flows = monthlyInvestmentFlows({
    transactions: trades,
    months: ["2026-06", "2026-07", "2026-08"],
    toBase,
  });

  it("kârı satışın yapıldığı aya yazar", () => {
    expect(flows.get("2026-06")!.realizedPL.toString()).toBe("120000");
  });

  it("satış olmayan aya kurdan hayalet K/Z düşürmez", () => {
    // Eskiden birikimli toplam her ay yeniden çevrilip farkı alınıyordu;
    // kur 40'tan 45'e çıkınca temmuza olmayan bir 15.000 kâr yazılıyordu.
    expect(flows.get("2026-07")!.realizedPL.toString()).toBe("0");
    expect(flows.get("2026-08")!.realizedPL.toString()).toBe("0");
  });
});
