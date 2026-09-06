import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyWhole, formatSignedWhole } from "@/lib/format";
import { sanitizeDecimalInput } from "@/components/ui/decimal-input";

describe("formatMoney", () => {
  it("tam sayıyı ondalıksız gösterir", () => {
    expect(formatMoney(1235, "TRY")).toBe("1.235 TRY");
  });
  it("kuruşlu tutarı yuvarlamaz", () => {
    expect(formatMoney(1234.56, "TRY")).toBe("1.234,56 TRY");
    expect(formatMoney(999.99, "TRY")).toBe("999,99 TRY");
  });
});

describe("formatMoneyWhole — üst özet kutuları", () => {
  it("kuruşu hiç göstermez", () => {
    expect(formatMoneyWhole(252437.47, "TRY")).toBe("252.437 TRY");
    expect(formatMoneyWhole(-820.09, "TRY")).toBe("-820 TRY");
  });

  it("en yakın tam sayıya yuvarlar, kırpmaz", () => {
    expect(formatMoneyWhole(999.99, "TRY")).toBe("1.000 TRY");
    expect(formatMoneyWhole(0.5, "TRY")).toBe("1 TRY");
  });

  it("tam sayıyı olduğu gibi bırakır", () => {
    expect(formatMoneyWhole(1235, "TRY")).toBe("1.235 TRY");
  });

  it("para birimi verilmezse sadece sayı döner", () => {
    expect(formatMoneyWhole(1234.56)).toBe("1.235");
  });

  it("geçersiz değerde tire gösterir", () => {
    expect(formatMoneyWhole(Number.NaN, "TRY")).toBe("— TRY");
  });

  it("formatMoney'i etkilemez (tablolarda kuruş korunur)", () => {
    expect(formatMoney(1234.56, "TRY")).toBe("1.234,56 TRY");
  });
});

describe("formatSignedWhole", () => {
  it("pozitifte artı koyar, kuruş göstermez", () => {
    expect(formatSignedWhole(118787.64, "TRY")).toBe("+118.788 TRY");
  });

  it("negatifte eksi zaten var, artı eklenmez", () => {
    expect(formatSignedWhole(-118787.64, "TRY")).toBe("-118.788 TRY");
  });

  it("sıfırda işaret koymaz", () => {
    expect(formatSignedWhole(0, "TRY")).toBe("0 TRY");
  });
});

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
