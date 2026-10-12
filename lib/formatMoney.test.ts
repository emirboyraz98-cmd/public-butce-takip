import { describe, expect, it } from "vitest";
import { formatMoney, formatPrice, formatQuantity, formatSigned } from "@/lib/format";
import { sanitizeDecimalInput } from "@/components/ui/decimal-input";

/*
 * Kuruş ekranda hiç gösterilmiyor. Yuvarlama YALNIZCA gösterimde: kayıtlar
 * kuruşuyla saklanıyor, formlar kuruş kabul ediyor, dışa aktarma ham değeri
 * yazıyor.
 */
describe("formatMoney", () => {
  it("kuruşu hiç göstermez", () => {
    expect(formatMoney(1234.56, "TRY")).toBe("1.235 TRY");
    expect(formatMoney(252437.47, "TRY")).toBe("252.437 TRY");
    expect(formatMoney(-820.09, "TRY")).toBe("-820 TRY");
  });

  it("en yakın tam sayıya yuvarlar, kırpmaz", () => {
    expect(formatMoney(999.99, "TRY")).toBe("1.000 TRY");
    expect(formatMoney(0.5, "TRY")).toBe("1 TRY");
    expect(formatMoney(0.4, "TRY")).toBe("0 TRY");
  });

  it("tam sayıyı olduğu gibi bırakır", () => {
    expect(formatMoney(1235, "TRY")).toBe("1.235 TRY");
  });

  it("binlik ayracı nokta", () => {
    expect(formatMoney(1234567, "TRY")).toBe("1.234.567 TRY");
  });

  it("metin girdiyi de kabul eder", () => {
    // Tutarlar sunucudan metin olarak geliyor (Decimal sınırı geçemiyor).
    expect(formatMoney("1234.56", "TRY")).toBe("1.235 TRY");
  });

  it("para birimi verilmezse sadece sayı döner", () => {
    expect(formatMoney(1234.56)).toBe("1.235");
  });

  it("geçersiz değerde tire gösterir", () => {
    expect(formatMoney(Number.NaN, "TRY")).toBe("— TRY");
    expect(formatMoney("abc")).toBe("—");
  });
});

describe("formatSigned", () => {
  it("pozitifte artı koyar, kuruş göstermez", () => {
    expect(formatSigned(118787.64, "TRY")).toBe("+118.788 TRY");
  });

  it("negatifte eksi zaten var, artı eklenmez", () => {
    expect(formatSigned(-118787.64, "TRY")).toBe("-118.788 TRY");
  });

  it("sıfırda işaret koymaz", () => {
    expect(formatSigned(0, "TRY")).toBe("0 TRY");
  });
});

/*
 * Buradaki ondalık kuruş değil, varlığın kendi hassasiyeti: 0,03 USD'lik
 * bir kripto ya da 0,3 ons altın yuvarlanınca anlamsızlaşır.
 */
describe("kuruş yuvarlaması fiyat ve adede bulaşmaz", () => {
  it("birim fiyat ondalığını korur", () => {
    expect(formatPrice(310.45, "TRY")).toBe("310,45 TRY");
    // 0,01 altındaki fiyatlarda 8 basamağa kadar korunur; yuvarlansa
    // küçük değerli varlıklar "0,00" görünürdü.
    expect(formatPrice(0.00042, "USD")).toBe("0,00042 USD");
  });

  it("adet ondalığını korur", () => {
    expect(formatQuantity(0.00042)).toBe("0,00042");
    expect(formatQuantity(2)).toBe("2");
  });
});

/* Girişte kuruş hâlâ yazılabiliyor; kapatılan şey yalnızca gösterim. */
describe("sanitizeDecimalInput", () => {
  it("baştaki sıfırı atar", () => {
    expect(sanitizeDecimalInput("017,5")).toBe("17,5");
    expect(sanitizeDecimalInput("01234,56")).toBe("1234,56");
  });
  it("0,5 gibi değerleri bozmaz", () => {
    expect(sanitizeDecimalInput("0,5")).toBe("0,5");
    expect(sanitizeDecimalInput("0")).toBe("0");
  });
  it("harf ve fazla ayracı temizler", () => {
    expect(sanitizeDecimalInput("1a2,3,4")).toBe("12,34");
  });
});
