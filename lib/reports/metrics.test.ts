import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { buildMetric, savingsRate } from "./metrics";

const m = (month: string, income: number, expenses: number) => ({
  month,
  income: new Decimal(income),
  expenses: new Decimal(expenses),
});

describe("savingsRate", () => {
  it("gelirin harcanmayan kısmını yüzde verir", () => {
    expect(savingsRate(m("2026-01", 100000, 60000))).toBe(40);
  });

  it("gider geliri aşarsa eksi çıkar", () => {
    expect(savingsRate(m("2026-01", 50000, 65000))).toBe(-30);
  });

  it("gelir sıfırsa tanımsız", () => {
    // Sıfır dönmek "hiç tasarruf edilmedi" derdi; oran hesaplanamıyor.
    expect(savingsRate(m("2026-01", 0, 5000))).toBeNull();
  });
});

describe("buildMetric", () => {
  const months = [
    m("2026-01", 100000, 60000),
    m("2026-02", 120000, 90000),
    m("2026-03", 0, 4000),
  ];

  it("giderleri toplar ve para birimi olarak işaretler", () => {
    const r = buildMetric("expenses", months);
    expect(r.title).toBe("Giderler");
    expect(r.unit).toBe("currency");
    expect(r.summary).toBe(154000);
    expect(r.points.map((p) => p.value)).toEqual([60000, 90000, 4000]);
  });

  it("gelirleri toplar", () => {
    expect(buildMetric("income", months).summary).toBe(220000);
  });

  it("neti gelir eksi gider olarak verir", () => {
    const r = buildMetric("net", months);
    expect(r.points.map((p) => p.value)).toEqual([40000, 30000, -4000]);
    expect(r.summary).toBe(66000);
  });

  it("tasarruf oranında gelirsiz ayı seriden çıkarır ve ortalamayı kalanlardan alır", () => {
    const r = buildMetric("savingsRate", months);
    expect(r.unit).toBe("percent");
    expect(r.points.map((p) => p.month)).toEqual(["2026-01", "2026-02"]);
    // (40 + 25) / 2 — üçüncü ay hiç sayılmıyor.
    expect(r.summary).toBe(32.5);
    expect(r.summaryLabel).toBe("dönem ortalaması");
  });

  it("hiç gelirli ay yoksa ortalama sıfır kalır, çökmez", () => {
    const r = buildMetric("savingsRate", [m("2026-01", 0, 100)]);
    expect(r.points).toEqual([]);
    expect(r.summary).toBe(0);
  });
});
