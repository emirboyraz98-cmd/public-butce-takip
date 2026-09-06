import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { freeCashBalance, monthlyInvestmentFlows } from "./cashFlow";

const identity = (amount: Decimal) => amount;

const tx = (
  date: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number,
  extra: { proceedsWithdrawn?: boolean; isOpening?: boolean } = {}
) => ({
  symbol: "X",
  assetType: "STOCK" as const,
  side,
  quantity: new Decimal(qty),
  pricePerUnit: new Decimal(price),
  currency: "TRY",
  tradedAt: new Date(`${date}T00:00:00Z`),
  createdAt: new Date(`${date}T00:00:00Z`),
  ...extra,
});

const flows = (transactions: Parameters<typeof monthlyInvestmentFlows>[0]["transactions"], months: string[]) =>
  monthlyInvestmentFlows({ transactions, months, toBase: identity });

describe("monthlyInvestmentFlows — serbest nakit", () => {
  it("çekilen satışı nakit akışına gelir yazar", () => {
    const r = flows([tx("2026-01-10", "SELL", 10, 100)], ["2026-01"]);
    expect(r.get("2026-01")!.sold.toString()).toBe("1000");
    expect(r.get("2026-01")!.netInvested.toString()).toBe("-1000");
  });

  it("çekilmeyen satışı nakit akışına HİÇ yazmaz", () => {
    const r = flows(
      [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      ["2026-01"]
    );
    // Para borsada duruyor; cebe girmediği için gelir de değil.
    expect(r.get("2026-01")!.sold.toString()).toBe("0");
    expect(r.get("2026-01")!.netInvested.toString()).toBe("0");
  });

  it("sonraki alımı serbest nakitten fonlar, gider yazmaz", () => {
    const r = flows(
      [
        tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false }),
        tx("2026-02-05", "BUY", 8, 100),
      ],
      ["2026-01", "2026-02"]
    );
    // 1000 serbest nakit, 800'lük alım tamamen oradan karşılanıyor.
    expect(r.get("2026-02")!.bought.toString()).toBe("0");
    expect(r.get("2026-02")!.fromFreeCash.toString()).toBe("800");
  });

  it("serbest nakti aşan alımda yalnızca farkı gider yazar", () => {
    const r = flows(
      [
        tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false }),
        tx("2026-02-05", "BUY", 15, 100),
      ],
      ["2026-01", "2026-02"]
    );
    // 1500 alım, 1000'i serbest nakitten; cepten çıkan 500.
    expect(r.get("2026-02")!.fromFreeCash.toString()).toBe("1000");
    expect(r.get("2026-02")!.bought.toString()).toBe("500");
  });

  it("serbest nakit aylar arasında taşınır", () => {
    const r = flows(
      [
        tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false }),
        tx("2026-03-05", "BUY", 4, 100),
        tx("2026-04-05", "BUY", 4, 100),
      ],
      ["2026-01", "2026-02", "2026-03", "2026-04"]
    );
    expect(r.get("2026-03")!.fromFreeCash.toString()).toBe("400");
    expect(r.get("2026-04")!.fromFreeCash.toString()).toBe("400");
    expect(r.get("2026-04")!.bought.toString()).toBe("0");
  });

  it("aralıktan ÖNCE biriken serbest nakit aralıktaki alımı fonlar", () => {
    const r = flows(
      [
        tx("2025-12-10", "SELL", 10, 100, { proceedsWithdrawn: false }),
        tx("2026-01-05", "BUY", 6, 100),
      ],
      ["2026-01"]
    );
    // Aralık dışındaki satış sonuçta görünmüyor ama parayı sağlıyor.
    expect(r.get("2026-01")!.bought.toString()).toBe("0");
    expect(r.get("2026-01")!.fromFreeCash.toString()).toBe("600");
  });

  it("açılış pozisyonu ne nakit akışına ne serbest nakde girer", () => {
    const r = flows(
      [
        tx("2026-01-02", "BUY", 10, 100, { isOpening: true }),
        tx("2026-01-10", "BUY", 5, 100),
      ],
      ["2026-01"]
    );
    expect(r.get("2026-01")!.bought.toString()).toBe("500");
    expect(r.get("2026-01")!.fromFreeCash.toString()).toBe("0");
  });

  it("belirtilmemiş satış eski davranışı korur (çekilmiş sayılır)", () => {
    const r = flows([tx("2026-01-10", "SELL", 3, 100)], ["2026-01"]);
    expect(r.get("2026-01")!.sold.toString()).toBe("300");
  });
});

describe("freeCashBalance", () => {
  it("çekilmeyen satışları biriktirir, alımlarla azaltır", () => {
    const balance = freeCashBalance({
      transactions: [
        tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false }),
        tx("2026-02-05", "BUY", 3, 100),
      ],
      toBase: identity,
    });
    expect(balance.toString()).toBe("700");
  });

  it("çekilen satış serbest nakde girmez", () => {
    const balance = freeCashBalance({
      transactions: [tx("2026-01-10", "SELL", 10, 100)],
      toBase: identity,
    });
    expect(balance.toString()).toBe("0");
  });

  it("eksiye düşmez", () => {
    // Serbest nakitten fazlasını almak, farkın cepten çıkması demek.
    const balance = freeCashBalance({
      transactions: [
        tx("2026-01-10", "SELL", 1, 100, { proceedsWithdrawn: false }),
        tx("2026-02-05", "BUY", 10, 100),
      ],
      toBase: identity,
    });
    expect(balance.toString()).toBe("0");
  });
});
