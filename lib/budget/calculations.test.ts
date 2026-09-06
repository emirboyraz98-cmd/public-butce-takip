import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { summarizeBudgets } from "./calculations";

const d = (n: string | number) => new Decimal(n);

describe("summarizeBudgets", () => {
  it("sınır altında kalan kategoride kalan tutarı verir", () => {
    const { rows } = summarizeBudgets([
      { categoryId: "1", name: "Market", limit: d(5000), spent: d(3000) },
    ]);
    expect(rows[0].percent).toBe(60);
    expect(rows[0].remaining.toString()).toBe("2000");
    expect(rows[0].overage.toString()).toBe("0");
  });

  it("aşımı ayrı verir ve çubuğu 100'de tutar", () => {
    const { rows } = summarizeBudgets([
      { categoryId: "1", name: "Yeme-İçme", limit: d(2000), spent: d(2600) },
    ]);
    // Çubuk kaba sığmalı; aşım genişlikle değil ayrı bir sayıyla anlatılıyor.
    expect(rows[0].percent).toBe(100);
    expect(rows[0].overage.toString()).toBe("600");
    expect(rows[0].remaining.toString()).toBe("0");
  });

  it("sınırsız kategoriyi toplamların dışında tutar", () => {
    const s = summarizeBudgets([
      { categoryId: "1", name: "Kira", limit: d(30000), spent: d(30000) },
      // Sınırı yok: harcaması toplamlara girmemeli, yoksa oran hiçbir
      // sınıra dayanmayan bir sayıya dönüşür.
      { categoryId: "2", name: "Diğer", limit: null, spent: d(99999) },
    ]);
    expect(s.totalLimit.toString()).toBe("30000");
    expect(s.totalSpent.toString()).toBe("30000");
    expect(s.totalRemaining.toString()).toBe("0");
    expect(s.rows[1].percent).toBe(0);
  });

  it("sıfır sınıra yapılan harcamayı tam aşım sayar", () => {
    const { rows } = summarizeBudgets([
      { categoryId: "1", name: "Sigara", limit: d(0), spent: d(450) },
    ]);
    // 450/0 tanımsız; çubuğu 0 göstermek "hiç harcanmadı" derdi.
    expect(rows[0].percent).toBe(100);
    expect(rows[0].overage.toString()).toBe("450");
  });

  it("sıfır sınıra hiç harcanmadıysa çubuk boş", () => {
    const { rows } = summarizeBudgets([
      { categoryId: "1", name: "Sigara", limit: d(0), spent: d(0) },
    ]);
    expect(rows[0].percent).toBe(0);
    expect(rows[0].overage.toString()).toBe("0");
  });

  it("toplam aşımda kalan negatife düşer", () => {
    const s = summarizeBudgets([
      { categoryId: "1", name: "A", limit: d(1000), spent: d(1500) },
      { categoryId: "2", name: "B", limit: d(1000), spent: d(900) },
    ]);
    expect(s.totalRemaining.toString()).toBe("-400");
    expect(s.overCount).toBe(1);
  });

  it("kuruşlu tutarlarda yuvarlama kaymaz", () => {
    const s = summarizeBudgets([
      { categoryId: "1", name: "A", limit: d("1000.10"), spent: d("333.37") },
    ]);
    expect(s.totalRemaining.toString()).toBe("666.73");
  });
});
