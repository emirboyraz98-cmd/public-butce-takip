import { describe, expect, it } from "vitest";

import { computeMonthNominal } from "./computeMonth";
import { markRange } from "./marks.testutil";

const rate = (
  amount: string,
  from: string,
  to: string | null = null
) => ({
  amount,
  effectiveFrom: new Date(`${from}T00:00:00Z`),
  effectiveTo: to ? new Date(`${to}T00:00:00Z`) : null,
});

/*
 * Senaryolar eskiden "çalışma dönemi" aralıklarıyla kuruluyordu; o kavram
 * kaldırıldı. markRange aynı aralıkları, uygulamanın yaptığı gibi gün gün
 * işaretlere açıyor — yani bu testler artık canlı yolu ölçüyor.
 */
describe("computeMonthNominal", () => {
  it("karma bir ayda şartname örneğini tutturur", () => {
    // 5–11 Ocak 2026 tam bir hafta: her zaman tam 1 pazar + 6 diğer gün.
    const marks = markRange("2026-01-05", "2026-01-11", "WORKED");
    markRange("2026-01-12", "2026-01-13", "LEAVE", new Set(), marks);

    const result = computeMonthNominal(
      "2026-01",
      [rate("2000", "2026-01-01")],
      marks
    );

    expect(result.dayTypeCounts).toEqual({
      NORMAL: 6,
      SUNDAY: 1,
      PUBLIC_HOLIDAY: 0,
      LEAVE: 2,
    });

    // 6*100 + 1*200 + 2*66.666... = 933.33
    expect(result.usdNominalTotal.toFixed(2)).toBe("933.33");
  });

  it("işaretsiz günleri hesaba katmaz", () => {
    const result = computeMonthNominal(
      "2026-02",
      [rate("2000", "2026-01-01")],
      new Map()
    );

    expect(result.usdNominalTotal.toFixed(2)).toBe("0.00");
    expect(result.breakdown).toHaveLength(0);
  });

  it("çalışılan resmi tatili tatil ücretinden öder", () => {
    const marks = markRange(
      "2026-01-01",
      "2026-01-01",
      "WORKED",
      new Set(["2026-01-01"])
    );

    const result = computeMonthNominal(
      "2026-01",
      [rate("2000", "2026-01-01")],
      marks
    );

    expect(result.dayTypeCounts.PUBLIC_HOLIDAY).toBe(1);
    expect(result.usdNominalTotal.toFixed(2)).toBe("166.67");
  });

  it("zam ortasında her güne kendi baz maaşını uygular", () => {
    // 5 Ocak pazartesi, 6 Ocak salı: ikisi de normal gün.
    const marks = markRange("2026-01-05", "2026-01-06", "WORKED");

    const result = computeMonthNominal(
      "2026-01",
      [
        rate("2000", "2026-01-01", "2026-01-05"),
        rate("2250", "2026-01-06"),
      ],
      marks
    );

    expect(result.breakdown.find((d) => d.date === "2026-01-05")?.amountUsd).toBe(
      "100.00"
    );
    expect(result.breakdown.find((d) => d.date === "2026-01-06")?.amountUsd).toBe(
      "112.50"
    );
  });

  it("işaretli güne baz maaş yoksa anlaşılır hata verir", () => {
    const marks = markRange("2026-01-05", "2026-01-05", "WORKED");

    expect(() =>
      computeMonthNominal("2026-01", [rate("2000", "2026-02-01")], marks)
    ).toThrow(/baz maaş/i);
  });
});
