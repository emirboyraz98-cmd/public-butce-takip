import { describe, expect, it } from "vitest";

import { computeMonthNominal } from "./computeMonth";
import type { WorkPeriodLike } from "./holidayCalendar";

describe("computeMonthNominal", () => {
  it("matches the spec validation example for a mixed month", () => {
    // 2026-01-05 -> 2026-01-11: tam bir hafta (7 gün), her zaman tam 1 Pazar + 6 diğer gün içerir
    const workPeriods: WorkPeriodLike[] = [
      {
        startDate: new Date("2026-01-05T00:00:00Z"),
        endDate: new Date("2026-01-11T00:00:00Z"),
        type: "WORKED",
      },
      {
        startDate: new Date("2026-01-12T00:00:00Z"),
        endDate: new Date("2026-01-13T00:00:00Z"),
        type: "LEAVE",
      },
    ];

    const result = computeMonthNominal(
      "2026-01",
      workPeriods,
      [
        {
          amount: "2000",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: null,
        },
      ],
      new Set(["2026-01-01"])
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

  it("excludes days not covered by any work period", () => {
    const result = computeMonthNominal(
      "2026-02",
      [],
      [
        {
          amount: "2000",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: null,
        },
      ],
      new Set()
    );

    expect(result.usdNominalTotal.toFixed(2)).toBe("0.00");
    expect(result.breakdown).toHaveLength(0);
  });

  it("applies a public holiday inside a WORKED period at the PUBLIC_HOLIDAY rate", () => {
    const workPeriods: WorkPeriodLike[] = [
      {
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-01-01T00:00:00Z"),
        type: "WORKED",
      },
    ];

    const result = computeMonthNominal(
      "2026-01",
      workPeriods,
      [
        {
          amount: "2000",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: null,
        },
      ],
      new Set(["2026-01-01"])
    );

    expect(result.dayTypeCounts.PUBLIC_HOLIDAY).toBe(1);
    expect(result.usdNominalTotal.toFixed(2)).toBe("166.67");
  });

  it("uses each day's own applicable base salary rate when a period spans a raise", () => {
    const workPeriods: WorkPeriodLike[] = [
      {
        startDate: new Date("2026-01-05T00:00:00Z"),
        endDate: new Date("2026-01-06T00:00:00Z"),
        type: "WORKED",
      },
    ];

    // 2026-01-05 Pazartesi, 2026-01-06 Salı: ikisi de NORMAL
    const result = computeMonthNominal(
      "2026-01",
      workPeriods,
      [
        {
          amount: "2000",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          effectiveTo: new Date("2026-01-05T00:00:00Z"),
        },
        {
          amount: "2250",
          effectiveFrom: new Date("2026-01-06T00:00:00Z"),
          effectiveTo: null,
        },
      ],
      new Set()
    );

    const day5 = result.breakdown.find((d) => d.date === "2026-01-05");
    const day6 = result.breakdown.find((d) => d.date === "2026-01-06");

    expect(day5?.amountUsd).toBe("100.00");
    expect(day6?.amountUsd).toBe("112.50");
  });

  it("throws a clear error when a covered day has no applicable base salary rate", () => {
    const workPeriods: WorkPeriodLike[] = [
      {
        startDate: new Date("2026-01-05T00:00:00Z"),
        endDate: new Date("2026-01-05T00:00:00Z"),
        type: "WORKED",
      },
    ];

    expect(() =>
      computeMonthNominal(
        "2026-01",
        workPeriods,
        [
          {
            amount: "2000",
            effectiveFrom: new Date("2026-02-01T00:00:00Z"),
            effectiveTo: null,
          },
        ],
        new Set()
      )
    ).toThrow(/baz maaş/i);
  });
});
