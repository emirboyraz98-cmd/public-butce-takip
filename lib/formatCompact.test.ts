import { describe, expect, it } from "vitest";

import { formatCompactNumber } from "./format";

describe("formatCompactNumber", () => {
  it("bin altını olduğu gibi yazar", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(840)).toBe("840");
    expect(formatCompactNumber(999)).toBe("999");
  });

  it("binleri B ile kısaltır, tek ondalıkla", () => {
    expect(formatCompactNumber(1000)).toBe("1B");
    expect(formatCompactNumber(92_100)).toBe("92,1B");
    expect(formatCompactNumber(106_530)).toBe("106,5B");
  });

  it("milyonları M ile kısaltır", () => {
    expect(formatCompactNumber(1_284_500)).toBe("1,3M");
    expect(formatCompactNumber(12_000_000)).toBe("12M");
  });

  it("yuvarlama ölçeği taşırırsa bir üste çıkar", () => {
    // 999.960 / 1000 = 999,96 -> 1000,0 olurdu; "1.000B" yerine "1M".
    expect(formatCompactNumber(999_960)).toBe("1M");
  });

  it("ters yönde ölçek yükseltmez", () => {
    // 999 "1B" olsaydı kısaltma bilgi kaybından ibaret olurdu; tam yazılır.
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(999.6)).toBe("1.000");
  });

  it("eksiyi tipografik eksi işaretiyle yazar", () => {
    expect(formatCompactNumber(-12_430)).toBe("−12,4B");
  });

  it("sayı olmayanı tire yapar", () => {
    expect(formatCompactNumber(Number.NaN)).toBe("—");
    expect(formatCompactNumber("abc")).toBe("—");
  });
});
