import { describe, expect, it } from "vitest";

import { computeHoldingPL, sumMarketValue } from "./calculations";

describe("computeHoldingPL", () => {
  it("computes market value and unrealized P/L for a gain", () => {
    const result = computeHoldingPL(2, 100, 150);

    expect(result.marketValue.toString()).toBe("300");
    expect(result.costBasis.toString()).toBe("200");
    expect(result.unrealizedPL.toString()).toBe("100");
    expect(result.unrealizedPLPercent?.toString()).toBe("50");
  });

  it("computes a negative unrealized P/L for a loss", () => {
    const result = computeHoldingPL(1, 200, 150);

    expect(result.unrealizedPL.toString()).toBe("-50");
    expect(result.unrealizedPLPercent?.toString()).toBe("-25");
  });

  it("returns null percent when cost basis is zero", () => {
    const result = computeHoldingPL(1, 0, 150);
    expect(result.unrealizedPLPercent).toBeNull();
  });
});

describe("sumMarketValue", () => {
  it("sums a list of decimal-like values", () => {
    expect(sumMarketValue([100, "50.5", 25]).toString()).toBe("175.5");
  });
});
