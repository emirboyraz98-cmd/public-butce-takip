import { describe, expect, it } from "vitest";

import { totalCarriers } from "./stackTotals";

describe("totalCarriers", () => {
  it("toplamı en üstteki dilime koyar", () => {
    expect(totalCarriers([10, 20, 30])).toEqual([0, 0, 60]);
  });

  it("en üstteki dilim sıfırsa bir alttakine kaydırır", () => {
    // Asıl hata buydu: "Diğer Gelir" sıfırken gelir toplamı hiç görünmüyordu.
    expect(totalCarriers([30, 0])).toEqual([30, 0]);
  });

  it("üstteki iki dilim sıfırsa en alttakine kadar iner", () => {
    expect(totalCarriers([7000, 0, 0])).toEqual([7000, 0, 0]);
  });

  it("aradaki sıfır dilimi atlar", () => {
    expect(totalCarriers([10, 0, 5])).toEqual([0, 0, 15]);
  });

  it("hepsi sıfırsa hiçbir yere toplam koymaz", () => {
    expect(totalCarriers([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("her zaman tam olarak bir taşıyıcı üretir", () => {
    const cases = [
      [1, 2, 3],
      [0, 2, 0],
      [5, 0, 0],
      [0, 0, 9],
    ];
    for (const slices of cases) {
      const carriers = totalCarriers(slices);
      expect(carriers.filter((v) => v !== 0)).toHaveLength(1);
    }
  });

  it("taşıyıcıdaki değer dilimlerin toplamına eşittir", () => {
    const slices = [18000, 4000, 7000];
    const carriers = totalCarriers(slices);
    expect(Math.max(...carriers)).toBe(29000);
  });

  it("dilim dizisiyle aynı uzunlukta döner", () => {
    expect(totalCarriers([1, 2])).toHaveLength(2);
    expect(totalCarriers([])).toEqual([]);
  });
});
