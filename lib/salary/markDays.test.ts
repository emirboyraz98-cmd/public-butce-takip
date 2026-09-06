import { describe, expect, it } from "vitest";

import { dayTypeForMark } from "./markDays";

const holidays = new Set(["2026-10-29"]);
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("dayTypeForMark", () => {
  describe("WORKED", () => {
    it("hafta içi normal gün", () => {
      expect(dayTypeForMark(d("2026-10-01"), "WORKED", holidays)).toBe("NORMAL");
    });

    it("pazarı pazar sayar", () => {
      // 4 Ekim 2026 pazar. Seçime düz NORMAL yazsaydık gün 11.25 yerine
      // 22.5 katsayısını kaybederdi.
      expect(dayTypeForMark(d("2026-10-04"), "WORKED", holidays)).toBe("SUNDAY");
    });

    it("resmi tatili tatil sayar", () => {
      expect(dayTypeForMark(d("2026-10-29"), "WORKED", holidays)).toBe(
        "PUBLIC_HOLIDAY"
      );
    });

    it("tatile denk gelen pazar, pazar kalır", () => {
      // 1 Kasım 2026 pazar; tatil de olsaydı yüksek olan kazanmalı.
      const both = new Set(["2026-11-01"]);
      expect(dayTypeForMark(d("2026-11-01"), "WORKED", both)).toBe("SUNDAY");
    });
  });

  describe("doğrudan tip", () => {
    it("pazar günü bile olsa izin yazılır", () => {
      expect(dayTypeForMark(d("2026-10-04"), "LEAVE", holidays)).toBe("LEAVE");
    });

    it("tatil günü bile olsa normal gün yazılabilir", () => {
      expect(dayTypeForMark(d("2026-10-29"), "NORMAL", holidays)).toBe("NORMAL");
    });
  });
});
