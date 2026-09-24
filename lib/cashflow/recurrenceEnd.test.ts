import { describe, expect, it } from "vitest";

import { appliesToMonth } from "./calculations";

const kira = (recurrenceEndMonth: string | null) => ({
  date: new Date("2026-05-01T00:00:00Z"),
  frequency: "MONTHLY" as const,
  recurrenceEndMonth,
});

/**
 * Tekrarlayan bir kaydı bitirmenin tek yolu onu silmekti; o da ödenmiş
 * ayları geçmişten düşürüyordu.
 */
describe("tekrarlayan kaydın bitişi", () => {
  it("bitiş yoksa süresiz tekrarlar", () => {
    expect(appliesToMonth(kira(null), "2030-12")).toBe(true);
  });

  it("bitiş ayı DAHİL sayılır", () => {
    expect(appliesToMonth(kira("2026-08"), "2026-08")).toBe(true);
  });

  it("bitişten sonraki ayda geçmez", () => {
    expect(appliesToMonth(kira("2026-08"), "2026-09")).toBe(false);
  });

  it("geçmiş aylar bitişten etkilenmez — ödenen kira kayıtta kalır", () => {
    for (const ay of ["2026-05", "2026-06", "2026-07"]) {
      expect(appliesToMonth(kira("2026-08"), ay)).toBe(true);
    }
  });

  it("başlangıçtan önceki ayda geçmez", () => {
    expect(appliesToMonth(kira("2026-08"), "2026-04")).toBe(false);
  });

  it("bitiş başlangıçtan önceyse hiçbir ayda geçmez", () => {
    // Bozuk veri: kayıt mayısta başlıyor ama mart'ta bitmiş görünüyor.
    for (const ay of ["2026-03", "2026-05", "2026-06"]) {
      expect(appliesToMonth(kira("2026-03"), ay)).toBe(false);
    }
  });

  it("tek seferlik kayıtta bitiş okunmaz", () => {
    const tek = {
      date: new Date("2026-05-10T00:00:00Z"),
      frequency: "ONE_TIME" as const,
      recurrenceEndMonth: "2026-01",
    };
    expect(appliesToMonth(tek, "2026-05")).toBe(true);
    expect(appliesToMonth(tek, "2026-06")).toBe(false);
  });

  it("alan hiç verilmemişse eski davranışı korur", () => {
    const eski = {
      date: new Date("2026-05-01T00:00:00Z"),
      frequency: "MONTHLY" as const,
    };
    expect(appliesToMonth(eski, "2030-12")).toBe(true);
  });
});
