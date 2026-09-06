import { describe, expect, it } from "vitest";

import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/defaults";

describe("default categories", () => {
  it("includes Diğer as the fallback expense category", () => {
    expect(DEFAULT_EXPENSE_CATEGORIES).toContain("Diğer");
  });

  it("includes Diğer as the fallback income category", () => {
    expect(DEFAULT_INCOME_CATEGORIES).toContain("Diğer");
  });
});
