import { describe, expect, it } from "vitest";

import { lastMonths, monthSequence } from "./months";

describe("lastMonths", () => {
  it("son 12 ayı verir, sonuncusu verilen ay", () => {
    const months = lastMonths("2026-08", 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-09");
    expect(months[11]).toBe("2026-08");
  });

  it("yıl sınırını aşar", () => {
    expect(lastMonths("2026-02", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("tek aylık pencere", () => {
    expect(lastMonths("2026-08", 1)).toEqual(["2026-08"]);
  });

  it("üretilen dizi kesintisizdir", () => {
    const months = lastMonths("2026-08", 24);
    expect(months).toEqual(monthSequence(months[0], "2026-08"));
  });
});
