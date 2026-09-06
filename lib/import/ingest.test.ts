import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { statementMonthFor } from "@/lib/expenses/creditCard";
import { buildImportRow, turkeyDateKey } from "./ingest";
import type { AkbankParsedTransaction } from "./akbank";

function tx(over: Partial<AkbankParsedTransaction> = {}): AkbankParsedTransaction {
  return {
    kind: "PURCHASE",
    cardLast4: "4321",
    cardName: "Axess Asıl",
    cardHolder: "AD SOYAD",
    amount: "100.00",
    currency: "TRY",
    sector: "YEMEK",
    installmentCount: 1,
    contactless: false,
    abroad: false,
    remainingLimit: null,
    ...over,
  };
}

const base = {
  baseCurrency: "TRY" as const,
  statementDay: 14,
  fxRate: null,
};

describe("statementMonthFor", () => {
  it("kesim gününde ve öncesinde aynı aya düşer", () => {
    expect(statementMonthFor("2026-08-01", 14)).toBe("2026-08");
    expect(statementMonthFor("2026-08-14", 14)).toBe("2026-08");
  });

  it("kesim gününden sonra gelecek aya düşer", () => {
    expect(statementMonthFor("2026-08-15", 14)).toBe("2026-09");
    expect(statementMonthFor("2026-08-31", 14)).toBe("2026-09");
  });

  it("yıl sonunu doğru döndürür", () => {
    expect(statementMonthFor("2026-12-20", 14)).toBe("2027-01");
  });

  it("aynı ayın başı ve sonu FARKLI ekstrelere düşer", () => {
    // Sabit ay kaydırmasının kaçırdığı şey tam olarak bu.
    expect(statementMonthFor("2026-08-03", 14)).not.toBe(
      statementMonthFor("2026-08-20", 14)
    );
  });
});

describe("turkeyDateKey", () => {
  it("gece yarısından sonraki harcamayı doğru güne yazar", () => {
    // 17 Ağustos 01:00 TR = 16 Ağustos 22:00 UTC. UTC alınsaydı 16'sına düşerdi.
    expect(turkeyDateKey(new Date("2026-08-16T22:00:00Z"))).toBe("2026-08-17");
  });

  it("gündüz saatlerinde gün değişmez", () => {
    expect(turkeyDateKey(new Date("2026-08-16T17:22:06Z"))).toBe("2026-08-16");
  });

  it("ay sonu gece harcaması sonraki aya geçer", () => {
    expect(turkeyDateKey(new Date("2026-08-31T21:30:00Z"))).toBe("2026-09-01");
  });
});

describe("buildImportRow", () => {
  it("aynı para biriminde çevrim yapmaz", () => {
    const row = buildImportRow("m1", {
      ...base,
      transaction: tx({ amount: "1900.00" }),
      receivedAt: new Date("2026-08-16T17:22:06Z"),
    });
    expect(row.rawAmount).toBe("1900.00");
    expect(row.amount).toBe("1900.00");
    expect(row.currency).toBe("TRY");
    expect(row.fxRate).toBe("1");
  });

  it("kesim gününe göre ekstre ayını hesaplar", () => {
    const early = buildImportRow("m1", {
      ...base,
      transaction: tx(),
      receivedAt: new Date("2026-08-03T10:00:00Z"),
    });
    const late = buildImportRow("m2", {
      ...base,
      transaction: tx(),
      receivedAt: new Date("2026-08-20T10:00:00Z"),
    });
    expect(early.paymentMonth).toBe("2026-08");
    expect(late.paymentMonth).toBe("2026-09");
  });

  it("yabancı parayı verilen kurla çevirir ve kuru saklar", () => {
    const row = buildImportRow("m3", {
      ...base,
      transaction: tx({ amount: "120.00", currency: "EUR" }),
      receivedAt: new Date("2026-08-16T12:00:00Z"),
      fxRate: new Decimal("47.5"),
    });
    expect(row.rawAmount).toBe("120.00");
    expect(row.rawCurrency).toBe("EUR");
    expect(row.amount).toBe("5700.00");
    expect(row.fxRate).toBe("47.5");
  });

  it("kur yoksa tutarı BOŞ bırakır — uydurmaz", () => {
    const row = buildImportRow("m4", {
      ...base,
      transaction: tx({ amount: "340.00", currency: "MAD" }),
      receivedAt: new Date("2026-08-16T12:00:00Z"),
      fxRate: null,
    });
    expect(row.rawAmount).toBe("340.00");
    expect(row.rawCurrency).toBe("MAD");
    expect(row.amount).toBeNull();
    expect(row.currency).toBeNull();
    expect(row.fxRate).toBeNull();
  });

  it("çevrimi kuruşa yuvarlar", () => {
    const row = buildImportRow("m5", {
      ...base,
      transaction: tx({ amount: "33.33", currency: "EUR" }),
      receivedAt: new Date("2026-08-16T12:00:00Z"),
      fxRate: new Decimal("47.123456"),
    });
    // 33.33 × 47.123456 = 1570.62478848 → aşağı yuvarlanır
    expect(row.amount).toBe("1570.62");
  });

  it("tam yarımı yukarı yuvarlar", () => {
    const row = buildImportRow("m5b", {
      ...base,
      transaction: tx({ amount: "3.00", currency: "EUR" }),
      receivedAt: new Date("2026-08-16T12:00:00Z"),
      fxRate: new Decimal("1.005"),
    });
    // 3.00 × 1.005 = 3.015 — tam sınır
    expect(row.amount).toBe("3.02");
  });

  it("taksit ve iptal bilgisini taşır", () => {
    const row = buildImportRow("m6", {
      ...base,
      transaction: tx({ installmentCount: 6, kind: "CANCELLATION" }),
      receivedAt: new Date("2026-08-16T12:00:00Z"),
    });
    expect(row.installmentCount).toBe(6);
    expect(row.kind).toBe("CANCELLATION");
  });

  it("harcama gününü Türkiye takvimine göre yazar", () => {
    const row = buildImportRow("m7", {
      ...base,
      transaction: tx(),
      receivedAt: new Date("2026-08-31T21:30:00Z"),
    });
    // 1 Eylül 00:30 TR — hem gün hem AY değişiyor.
    expect(row.occurredAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(row.paymentMonth).toBe("2026-09");
  });
});
