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

/**
 * Bir alım/satıma bağlı olmayan transferler: yatırım hesabı ile cep
 * arasında giden gelen para.
 */
const mv = (
  date: string,
  direction: "DEPOSIT" | "WITHDRAWAL",
  amount: number
) => ({
  direction,
  amount: new Decimal(amount),
  currency: "TRY",
  occurredAt: new Date(`${date}T00:00:00Z`),
});

describe("nakit hareketleri — çekme", () => {
  it("serbest nakdi düşürür", () => {
    const balance = freeCashBalance({
      transactions: [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-03-04", "WITHDRAWAL", 400)],
      toBase: identity,
    });
    expect(balance.toString()).toBe("600");
  });

  it("parayı satış ayına değil ÇEKİLDİĞİ aya yazar", () => {
    const r = monthlyInvestmentFlows({
      transactions: [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-03-04", "WITHDRAWAL", 400)],
      months: ["2026-01", "2026-02", "2026-03"],
      toBase: identity,
    });
    // Ocak'ta satış var ama para borsada kaldı: cebe hiçbir şey girmedi.
    expect(r.get("2026-01")!.netInvested.toString()).toBe("0");
    expect(r.get("2026-03")!.withdrawn.toString()).toBe("400");
    expect(r.get("2026-03")!.netInvested.toString()).toBe("-400");
  });

  it("çekimi Alım/Satış sütunlarına karıştırmaz", () => {
    const r = monthlyInvestmentFlows({
      transactions: [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-01-20", "WITHDRAWAL", 400)],
      months: ["2026-01"],
      toBase: identity,
    });
    // Bu iki alan kullanıcıya "Alım" ve "Satış" olarak gösteriliyor.
    expect(r.get("2026-01")!.bought.toString()).toBe("0");
    expect(r.get("2026-01")!.sold.toString()).toBe("0");
  });

  it("aynı gün satılıp çekilen parayı kırpmaz", () => {
    // Kayıt sırası ne olursa olsun: giriş, aynı günkü çıkıştan önce işlenir.
    const balance = freeCashBalance({
      transactions: [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-01-10", "WITHDRAWAL", 1000)],
      toBase: identity,
    });
    expect(balance.toString()).toBe("0");
  });

  it("olmayan parayı çektirmez, eksiye düşmez", () => {
    const balance = freeCashBalance({
      transactions: [tx("2026-01-10", "SELL", 1, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-02-01", "WITHDRAWAL", 5000)],
      toBase: identity,
    });
    expect(balance.toString()).toBe("0");
  });

  it("kırpılan çekimde yalnızca gerçekten çıkan parayı nakde yazar", () => {
    const r = monthlyInvestmentFlows({
      transactions: [tx("2026-01-10", "SELL", 1, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-02-01", "WITHDRAWAL", 5000)],
      months: ["2026-01", "2026-02"],
      toBase: identity,
    });
    expect(r.get("2026-02")!.withdrawn.toString()).toBe("100");
  });
});

describe("nakit hareketleri — yatırma", () => {
  it("serbest nakde eklenir", () => {
    const balance = freeCashBalance({
      transactions: [],
      cashMovements: [mv("2026-01-05", "DEPOSIT", 2000)],
      toBase: identity,
    });
    expect(balance.toString()).toBe("2000");
  });

  it("parayı yatırıldığı ayda cepten çıkmış sayar", () => {
    const r = monthlyInvestmentFlows({
      transactions: [],
      cashMovements: [mv("2026-01-05", "DEPOSIT", 2000)],
      months: ["2026-01"],
      toBase: identity,
    });
    expect(r.get("2026-01")!.deposited.toString()).toBe("2000");
    expect(r.get("2026-01")!.netInvested.toString()).toBe("2000");
  });

  it("sonraki alımı fonlar, parayı İKİNCİ kez cepten çıkarmaz", () => {
    const r = monthlyInvestmentFlows({
      transactions: [tx("2026-02-10", "BUY", 8, 100)],
      cashMovements: [mv("2026-01-05", "DEPOSIT", 2000)],
      months: ["2026-01", "2026-02"],
      toBase: identity,
    });
    // Para ocakta çıktı; şubattaki alım serbest nakitten karşılanıyor.
    expect(r.get("2026-01")!.netInvested.toString()).toBe("2000");
    expect(r.get("2026-02")!.bought.toString()).toBe("0");
    expect(r.get("2026-02")!.fromFreeCash.toString()).toBe("800");
    expect(r.get("2026-02")!.netInvested.toString()).toBe("0");
  });

  it("yatırılandan fazla alımda aradaki farkı cepten yazar", () => {
    const r = monthlyInvestmentFlows({
      transactions: [tx("2026-02-10", "BUY", 30, 100)],
      cashMovements: [mv("2026-01-05", "DEPOSIT", 2000)],
      months: ["2026-01", "2026-02"],
      toBase: identity,
    });
    expect(r.get("2026-02")!.bought.toString()).toBe("1000");
    expect(r.get("2026-02")!.fromFreeCash.toString()).toBe("2000");
  });
});

describe("freeCashBalance — geçmişe dönük bakiye", () => {
  it("`until` sonrasındaki hareketleri saymaz", () => {
    const args = {
      transactions: [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      cashMovements: [mv("2026-03-04", "WITHDRAWAL", 400)],
      toBase: identity,
    };
    // Şubat sonu itibarıyla mart çekimi henüz olmamıştı.
    expect(
      freeCashBalance({ ...args, until: new Date("2026-02-28T23:59:59Z") }).toString()
    ).toBe("1000");
    expect(freeCashBalance(args).toString()).toBe("600");
  });

  it("`until` gününün kendisini dahil eder", () => {
    const balance = freeCashBalance({
      transactions: [tx("2026-01-10", "SELL", 10, 100, { proceedsWithdrawn: false })],
      toBase: identity,
      until: new Date("2026-01-10T00:00:00Z"),
    });
    expect(balance.toString()).toBe("1000");
  });
});
