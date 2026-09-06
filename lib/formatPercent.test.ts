import { describe, expect, it } from "vitest";

import { formatPercent } from "./format";

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
