import { describe, expect, it } from "vitest";

import { findRateForMonth } from "./computeAndSave";
import { resolveOverlaps } from "./effectiveRate";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Değişkenden sabite geçen tipik bir geçmiş. */
const rates = [
  {
    id: "degisken",
    mode: "VARIABLE" as const,
    effectiveFrom: d("2026-01-01"),
    effectiveTo: d("2026-08-31"),
  },
  {
    id: "sabit",
    mode: "FIXED" as const,
    effectiveFrom: d("2026-09-01"),
    effectiveTo: null,
  },
];

describe("findRateForMonth", () => {
  it("ayın türü, ayı kapsayan dönemden gelir", () => {
    expect(findRateForMonth("2026-07", rates)?.mode).toBe("VARIABLE");
    expect(findRateForMonth("2026-09", rates)?.mode).toBe("FIXED");
  });

  it("geçiş ayı sabite değil, hâlâ değişkene ait", () => {
    // Asıl mesele bu: 2026-08 eski işin son ayı. Tür kullanıcıda tutulurken
    // sabite geçildiği anda bu ay da sabit sayılıyor ve gün bazlı geçmiş
    // kayboluyordu.
    expect(findRateForMonth("2026-08", rates)?.mode).toBe("VARIABLE");
  });

  it("açık uçlu dönem sonraki bütün ayları kapsar", () => {
    expect(findRateForMonth("2027-05", rates)?.mode).toBe("FIXED");
  });

  it("hiçbir dönemin kapsamadığı ay null döner", () => {
    expect(findRateForMonth("2025-12", rates)).toBeNull();
  });
});

describe("araya dönem sokmak", () => {
  it("bölünen dönemin kuyruğu KENDİ türünü korur", () => {
    /*
     * Değişken bir dönemin ortasına sabit bir dönem sokuluyor. Kuyruk
     * parçası yeni dönemin türünü kopyalasaydı, aradaki sabit işten sonraki
     * aylar da sabite dönerdi.
     */
    const { creates, updates } = resolveOverlaps(
      [
        {
          id: "degisken",
          mode: "VARIABLE" as const,
          effectiveFrom: d("2026-01-01"),
          effectiveTo: d("2026-12-31"),
        },
      ],
      { effectiveFrom: d("2026-05-01"), effectiveTo: d("2026-06-30") }
    );

    expect(updates).toHaveLength(1);
    expect(creates).toHaveLength(1);
    expect(creates[0].source.mode).toBe("VARIABLE");
    expect(creates[0].effectiveFrom).toEqual(d("2026-07-01"));
  });
});
