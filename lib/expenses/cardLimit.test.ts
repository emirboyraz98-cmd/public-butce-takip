import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { cardLimitStatus } from "./cardLimit";

describe("cardLimitStatus", () => {
  it("sınırın altında kalanı kalanıyla birlikte verir", () => {
    const s = cardLimitStatus(40000, 25000);
    expect(s.percent).toBeCloseTo(62.5);
    expect(s.remaining.toFixed(2)).toBe("15000.00");
    expect(s.overage.isZero()).toBe(true);
    expect(s.over).toBe(false);
    expect(s.nearLimit).toBe(false);
  });

  it("aşımı tutar olarak söyler ve kalanı sıfırlar", () => {
    const s = cardLimitStatus(40000, 47500);
    expect(s.over).toBe(true);
    expect(s.overage.toFixed(2)).toBe("7500.00");
    expect(s.remaining.isZero()).toBe(true);
  });

  it("çubuk yüzdesi 100'de kırpılır, ham oran kırpılmaz", () => {
    // Kırpma çubuk için: %180 genişlik kaba sığmıyordu. Metin ham oranı
    // kullanmalı ki aşımın büyüklüğü görünsün.
    const s = cardLimitStatus(10000, 18000);
    expect(s.percent).toBe(100);
    expect(s.rawPercent).toBeCloseTo(180);
  });

  it("%80'den itibaren yaklaşıyor sayar", () => {
    expect(cardLimitStatus(10000, 7999).nearLimit).toBe(false);
    expect(cardLimitStatus(10000, 8000).nearLimit).toBe(true);
    expect(cardLimitStatus(10000, 9999).nearLimit).toBe(true);
  });

  it("aşıldığında artık 'yaklaşıyor' demez", () => {
    // İkisi aynı anda doğru olsaydı arayüz hem uyarı hem aşım gösterirdi.
    const s = cardLimitStatus(10000, 12000);
    expect(s.over).toBe(true);
    expect(s.nearLimit).toBe(false);
  });

  describe("sıfır sınır", () => {
    it("harcama varsa tam aşım sayılır", () => {
      // 0 hedefe yapılan her harcama aşımdır; oran hesabı sonsuz olduğu için
      // çubuk NaN genişlik alıyordu.
      const s = cardLimitStatus(0, 500);
      expect(s.percent).toBe(100);
      expect(s.over).toBe(true);
      expect(s.overage.toFixed(2)).toBe("500.00");
    });

    it("harcama da yoksa hedef tutmuştur", () => {
      const s = cardLimitStatus(0, 0);
      expect(s.percent).toBe(0);
      expect(s.over).toBe(false);
    });
  });

  it("Decimal, string ve number girdilerini kabul eder", () => {
    const a = cardLimitStatus(new Decimal("40000"), new Decimal("10000"));
    const b = cardLimitStatus("40000", "10000");
    const c = cardLimitStatus(40000, 10000);
    expect([a.percent, b.percent, c.percent]).toEqual([25, 25, 25]);
  });

  it("kuruşları kaybetmez", () => {
    const s = cardLimitStatus("1000.00", "333.33");
    expect(s.remaining.toFixed(2)).toBe("666.67");
  });
});
