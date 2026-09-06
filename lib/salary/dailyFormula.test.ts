import { describe, expect, it } from "vitest";

import { dailyAmountUsd, hourlyRateFromBaseSalary } from "./dailyFormula";

describe("dailyFormula", () => {
  // Spec doğrulama örneği: Baz maaş $2.000 -> saatlik ücret $8,89,
  // Normal Gün nominal ≈$100, İzinli gün nominal ≈$66,67 (=2000/30)
  const hourlyRate = hourlyRateFromBaseSalary(2000);

  it("computes hourly rate as baseSalary / 225", () => {
    expect(hourlyRate.toFixed(2)).toBe("8.89");
  });

  it("computes Normal Gün as ~$100", () => {
    expect(dailyAmountUsd("NORMAL", hourlyRate).toFixed(2)).toBe("100.00");
  });

  it("computes İzinli gün as ~$66.67 (= baseSalary / 30)", () => {
    const izinli = dailyAmountUsd("LEAVE", hourlyRate);
    expect(izinli.toFixed(2)).toBe("66.67");
    expect(izinli.toFixed(2)).toBe((2000 / 30).toFixed(2));
  });

  it("computes Pazar as 2x Normal Gün - 22.5", () => {
    expect(dailyAmountUsd("SUNDAY", hourlyRate).toFixed(2)).toBe("200.00");
  });

  it("computes Resmi Tatil between Normal and Pazar", () => {
    expect(dailyAmountUsd("PUBLIC_HOLIDAY", hourlyRate).toFixed(2)).toBe(
      "166.67"
    );
  });
});
