import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { monthlyTotals } from "./monthlyTotals";

/** Kur çevrimi yok; tutarlar zaten baz para biriminde varsayılıyor. */
const identity = (amount: Decimal) => amount;

const base = {
  incomeEntries: [],
  expenses: [],
  loans: [],
  cardPayments: [],
  salaryByAccrualMonth: new Map<string, { amount: string; currency: string }>(),
  salaryOffset: 0,
  toBase: identity,
};


describe("monthlyTotals", () => {
  it("tek seferlik geliri kendi ayına, aylık geliri sonraki aylara da yazar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-01", "2026-02"],
      incomeEntries: [
        { date: new Date("2026-01-15T00:00:00Z"), frequency: "ONE_TIME", amount: "1000", currency: "TRY" },
        { date: new Date("2026-01-01T00:00:00Z"), frequency: "MONTHLY", amount: "500", currency: "TRY" },
      ],
    });
    expect(r[0].income.toString()).toBe("1500");
    expect(r[1].income.toString()).toBe("500");
  });

  it("kart harcamasını ekstrenin ÖDENDİĞİ aya yazar, yapıldığı aya değil", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-01", "2026-02"],
      expenses: [
        {
          date: new Date("2026-01-20T00:00:00Z"),
          frequency: "ONE_TIME",
          amount: "2400",
          currency: "TRY",
          kind: "CREDIT_CARD",
          paymentMonth: "2026-02",
          installmentCount: 1,
        },
      ],
    });
    expect(r[0].expenses.toString()).toBe("0");
    expect(r[1].expenses.toString()).toBe("2400");
  });

  it("taksitli kart harcamasında yalnızca o ayın taksitini sayar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-02", "2026-03", "2026-04"],
      expenses: [
        {
          date: new Date("2026-01-20T00:00:00Z"),
          frequency: "ONE_TIME",
          amount: "3000",
          currency: "TRY",
          kind: "CREDIT_CARD",
          paymentMonth: "2026-02",
          installmentCount: 3,
        },
      ],
    });
    expect(r.map((x) => x.expenses.toString())).toEqual(["1000", "1000", "1000"]);
  });

  it("nakit gideri kendi ayında sayar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-01"],
      expenses: [
        {
          date: new Date("2026-01-05T00:00:00Z"),
          frequency: "ONE_TIME",
          amount: "800",
          currency: "TRY",
          kind: "OTHER",
          paymentMonth: null,
          installmentCount: 1,
        },
      ],
    });
    expect(r[0].expenses.toString()).toBe("800");
  });

  it("maaşı hak ediş ayına değil ÖDENDİĞİ aya yazar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-01", "2026-02"],
      salaryOffset: 1,
      salaryByAccrualMonth: new Map([
        ["2026-01", { amount: "50000", currency: "TRY" }],
      ]),
    });
    // Ocakta hak edilen maaş şubatta elimize geçiyor.
    expect(r[0].income.toString()).toBe("0");
    expect(r[1].income.toString()).toBe("50000");
  });

  it("kredi taksitini o ayın giderine ekler", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-03"],
      loans: [
        {
          id: "l1",
          name: "Konut",
          currency: "TRY",
          startMonth: "2026-01",
          endMonth: "2026-12",
          periods: [{ effectiveFrom: "2026-01", amount: "7500" }],
        },
      ],
    });
    expect(r[0].expenses.toString()).toBe("7500");
  });

  it("kaynakları tek toplamda birleştirir", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-03"],
      expenses: [
        { date: new Date("2026-03-02T00:00:00Z"), frequency: "ONE_TIME", amount: "1000", currency: "TRY", kind: "OTHER", paymentMonth: null, installmentCount: 1 },
        { date: new Date("2026-02-10T00:00:00Z"), frequency: "ONE_TIME", amount: "2000", currency: "TRY", kind: "CREDIT_CARD", paymentMonth: "2026-03", installmentCount: 1 },
      ],
      loans: [
        { id: "l1", name: "Taşıt", currency: "TRY", startMonth: "2026-01", endMonth: "2026-12", periods: [{ effectiveFrom: "2026-01", amount: "500" }] },
      ],
    });
    expect(r[0].expenses.toString()).toBe("3500");
  });
});

const card = (
  date: string,
  amount: string,
  paymentMonth: string,
  installmentCount = 1
) => ({
  date: new Date(`${date}T00:00:00Z`),
  frequency: "ONE_TIME" as const,
  amount,
  currency: "TRY",
  kind: "CREDIT_CARD" as const,
  paymentMonth,
  installmentCount,
});

describe("monthlyTotals — kart ekstre defteri", () => {
  it("ödeme girilmemişse ekstrenin tamamını gider yazar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-02"],
      expenses: [card("2026-01-20", "1000", "2026-02")],
    });
    expect(r[0].expenses.toString()).toBe("1000");
  });

  it("KISMİ ödemede ekstreyi değil ÖDENENİ gider yazar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-02"],
      expenses: [card("2026-01-20", "1000", "2026-02")],
      cardPayments: [{ month: "2026-02", amount: "400", currency: "TRY" }],
    });
    // Cepten 400 çıktı; kalan 600 sonraki aya devrediyor.
    expect(r[0].expenses.toString()).toBe("400");
  });

  it("devreden borcun kapandığı ayda gider ekstreden BÜYÜK olur", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-02", "2026-03"],
      expenses: [
        card("2026-01-20", "1000", "2026-02"),
        card("2026-02-10", "500", "2026-03"),
      ],
      cardPayments: [{ month: "2026-02", amount: "400", currency: "TRY" }],
    });
    expect(r[0].expenses.toString()).toBe("400");
    // Mart: 500 ekstre + 600 devreden = 1100, ödeme girilmediği için tamamı.
    expect(r[1].expenses.toString()).toBe("1100");
  });

  it("aralık ÖNCESİNDEKİ devir aralığın ilk ayına taşınır", () => {
    // Defter yalnızca seçilen aralıktan kurulsaydı ocaktaki borç kaybolur,
    // şubat 500 görünürdü.
    const r = monthlyTotals({
      ...base,
      months: ["2026-03"],
      expenses: [
        card("2026-01-20", "1000", "2026-02"),
        card("2026-02-10", "500", "2026-03"),
      ],
      cardPayments: [{ month: "2026-02", amount: "400", currency: "TRY" }],
    });
    expect(r[0].expenses.toString()).toBe("1100");
  });

  it("taksitli harcamayı ekstre ayına yayar", () => {
    const r = monthlyTotals({
      ...base,
      months: ["2026-02", "2026-03", "2026-04"],
      expenses: [card("2026-01-20", "3000", "2026-02", 3)],
    });
    expect(r.map((x) => x.expenses.toString())).toEqual([
      "1000",
      "1000",
      "1000",
    ]);
  });
});
