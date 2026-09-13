import { describe, expect, it } from "vitest";

import { formatPercent, percentShare } from "./format";

describe("formatPercent", () => {
  it("işareti yüzde iminin ÖNÜNE koyar", () => {
    // Ham çıktıyı "%" ile birleştirmek `%-45.77` üretiyordu.
    expect(formatPercent(-45.77)).toBe("-%45,77");
  });

  it("ondalık ayracı virgül", () => {
    expect(formatPercent(1.79)).toBe("%1,79");
  });

  it("istenirse artı işaretini de yazar", () => {
    expect(formatPercent(1.41, { sign: true })).toBe("+%1,41");
    expect(formatPercent(-1.41, { sign: true })).toBe("-%1,41");
  });

  it("sıfırda işaret koymaz", () => {
    expect(formatPercent(0, { sign: true })).toBe("%0,00");
  });

  it("metin girdiyi de kabul eder", () => {
    expect(formatPercent("11.90", { sign: true })).toBe("+%11,90");
  });

  it("sayı olmayanı tire yapar", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatPercent — ondalık basamak", () => {
  it("tek ondalık istenebilir", () => {
    // Raporlardaki tasarruf oranı `toFixed(1)` ile `%78.0` yazıyordu:
    // nokta ayraç, oysa uygulamanın geri kalanı virgül kullanıyor.
    expect(formatPercent(78.04, { digits: 1 })).toBe("%78,0");
  });

  it("ondalıksız istenebilir", () => {
    expect(formatPercent(62.5, { digits: 0 })).toBe("%63");
    expect(formatPercent(62.4, { digits: 0 })).toBe("%62");
  });

  it("varsayılan iki ondalık kalır", () => {
    expect(formatPercent(78.04)).toBe("%78,04");
  });
});

describe("percentShare", () => {
  it("payı paydaya oranlar", () => {
    expect(percentShare(25, 200)).toBe(12.5);
  });

  it("payda sıfırsa null — arayüze NaN/Infinity sızmasın", () => {
    expect(percentShare(5, 0)).toBeNull();
    expect(percentShare(0, 0)).toBeNull();
  });

  it("sayı olmayanda null", () => {
    expect(percentShare(Number.NaN, 100)).toBeNull();
  });
});
