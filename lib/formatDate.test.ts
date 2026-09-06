import { describe, expect, it } from "vitest";

import { formatDate, formatMonth } from "@/lib/format";

describe("formatMonth", () => {
  it("ayı türkçe kısaltmayla yazar", () => {
    expect(formatMonth("2026-06")).toBe("Haz 2026");
    expect(formatMonth("2026-01")).toBe("Oca 2026");
    expect(formatMonth("2026-12")).toBe("Ara 2026");
  });

  it("on ikinin tamamı doğru", () => {
    const all = Array.from({ length: 12 }, (_, i) =>
      formatMonth(`2026-${String(i + 1).padStart(2, "0")}`)
    );
    expect(all).toEqual([
      "Oca 2026", "Şub 2026", "Mar 2026", "Nis 2026", "May 2026", "Haz 2026",
      "Tem 2026", "Ağu 2026", "Eyl 2026", "Eki 2026", "Kas 2026", "Ara 2026",
    ]);
  });

  it("geçersiz girdiyi bozmaz", () => {
    expect(formatMonth("2026-13")).toBe("2026-13");
    expect(formatMonth("süresiz")).toBe("süresiz");
    expect(formatMonth("")).toBe("");
    expect(formatMonth("2026-06-13")).toBe("2026-06-13");
  });
});

describe("formatDate", () => {
  it("tam tarihi gün + kısa ay + yıl yazar", () => {
    expect(formatDate("2026-06-13")).toBe("13 Haz 2026");
    expect(formatDate("2026-12-31")).toBe("31 Ara 2026");
  });

  it("günün başındaki sıfırı atar", () => {
    expect(formatDate("2026-06-03")).toBe("3 Haz 2026");
    expect(formatDate("2026-06-01")).toBe("1 Haz 2026");
  });

  it("geçersiz girdiyi bozmaz", () => {
    expect(formatDate("2026-06")).toBe("2026-06");
    expect(formatDate("2026-13-01")).toBe("2026-13-01");
    expect(formatDate("")).toBe("");
  });
});

describe("saat dilimi bağımsızlığı", () => {
  it("ayın ilk günü bir önceki aya kaymaz", () => {
    // Date nesnesine çevrilseydi negatif ofsetli makinede mayısa düşerdi.
    expect(formatDate("2026-06-01")).toBe("1 Haz 2026");
    expect(formatMonth("2026-06")).toBe("Haz 2026");
    expect(formatDate("2026-01-01")).toBe("1 Oca 2026");
  });
});
