import { describe, expect, it } from "vitest";

import { resolvePeriodEndChange } from "./periodBoundary";

const periods = [
  { id: "p1", effectiveFrom: "2026-07" },
  { id: "p2", effectiveFrom: "2026-08" },
  { id: "p3", effectiveFrom: "2027-01" },
  { id: "p4", effectiveFrom: "2028-01" },
];

const resolve = (periodId: string, newEnd: string, loanEndMonth = "2028-02") =>
  resolvePeriodEndChange({ periods, periodId, newEnd, loanEndMonth });

describe("resolvePeriodEndChange", () => {
  it("bitişi uzatmak sonraki dönemin başlangıcını iter", () => {
    // p1 şu an 2026-07 – 2026-07 (p2 ağustosta başlıyor). Bitişi ekime alalım.
    const result = resolve("p1", "2026-10");
    expect(result).toEqual({
      ok: true,
      change: { kind: "nextPeriodStart", periodId: "p2", newStart: "2026-11" },
    });
  });

  it("bitişi kısaltmak da sonraki dönemi çeker", () => {
    // p2 şu an 2026-08 – 2026-12. Bitişi eylüle alalım.
    const result = resolve("p2", "2026-09");
    expect(result).toEqual({
      ok: true,
      change: { kind: "nextPeriodStart", periodId: "p3", newStart: "2026-10" },
    });
  });

  it("bitiş zaten doğruysa hiçbir şey değiştirmez", () => {
    // p1'in mevcut bitişi 2026-07 (p2 2026-08'de başlıyor).
    expect(resolve("p1", "2026-07")).toEqual({ ok: true, change: null });
  });

  it("son dönemin bitişi kredinin bitişini günceller", () => {
    const result = resolve("p4", "2028-06");
    expect(result).toEqual({
      ok: true,
      change: { kind: "loanEndMonth", newEndMonth: "2028-06" },
    });
  });

  it("son dönemde kredi bitişi zaten aynıysa değişiklik yok", () => {
    expect(resolve("p4", "2028-02")).toEqual({ ok: true, change: null });
  });

  it("bitiş, kendi başlangıcından önce olamaz", () => {
    const result = resolve("p3", "2026-11");
    expect(result).toEqual({
      ok: false,
      error: "Dönem bitişi, başlangıcından önce olamaz",
    });
  });

  it("sonraki dönemi ondan sonrakinin üstüne taşımaz", () => {
    // p1'in bitişini 2027-05 yapmak p2'yi 2027-06'ya iter — ama p3 2027-01'de.
    const result = resolve("p1", "2027-05");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("sonraki dönemleri karıştırır");
  });

  it("sonraki dönemi kredinin dışına taşımaz", () => {
    // p3'ün bitişini kredinin sonuna almak p4'ü dışarı iterdi.
    const result = resolvePeriodEndChange({
      periods: periods.slice(0, 4),
      periodId: "p3",
      newEnd: "2028-02",
      loanEndMonth: "2028-02",
    });
    expect(result.ok).toBe(false);
  });

  it("süresiz kredide son dönemin bitişi kredi bitişini kurar", () => {
    const result = resolvePeriodEndChange({
      periods,
      periodId: "p4",
      newEnd: "2029-01",
      loanEndMonth: null,
    });
    expect(result).toEqual({
      ok: true,
      change: { kind: "loanEndMonth", newEndMonth: "2029-01" },
    });
  });

  it("bilinmeyen dönem kimliği hata döner", () => {
    expect(resolve("yok", "2026-09")).toEqual({
      ok: false,
      error: "Dönem bulunamadı",
    });
  });
});
