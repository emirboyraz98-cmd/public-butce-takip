import { describe, expect, it } from "vitest";

import { computeMonthlyCashflow, type MoneyEntry } from "./calculations";

describe("computeMonthlyCashflow", () => {
  it("sums one-time entries only in their own month, split by currency", () => {
    const income: MoneyEntry[] = [
      { amount: 1000, currency: "TRY", date: new Date("2026-03-05"), frequency: "ONE_TIME" },
      { amount: 200, currency: "USD", date: new Date("2026-02-10"), frequency: "ONE_TIME" },
    ];
    const expenses: MoneyEntry[] = [
      { amount: 300, currency: "TRY", date: new Date("2026-03-15"), frequency: "ONE_TIME" },
    ];

    const result = computeMonthlyCashflow(income, expenses, "2026-03");

    expect(result.income.TRY.toString()).toBe("1000");
    expect(result.income.USD.toString()).toBe("0");
    expect(result.expenses.TRY.toString()).toBe("300");
    expect(result.net.TRY.toString()).toBe("700");
  });

  it("recurs MONTHLY entries into every month from their start date onward", () => {
    const expenses: MoneyEntry[] = [
      { amount: 500, currency: "TRY", date: new Date("2026-01-01"), frequency: "MONTHLY" },
    ];

    expect(computeMonthlyCashflow([], expenses, "2026-01").expenses.TRY.toString()).toBe("500");
    expect(computeMonthlyCashflow([], expenses, "2026-06").expenses.TRY.toString()).toBe("500");
  });

  it("excludes a MONTHLY entry from months before it started", () => {
    const expenses: MoneyEntry[] = [
      { amount: 500, currency: "TRY", date: new Date("2026-06-01"), frequency: "MONTHLY" },
    ];

    expect(computeMonthlyCashflow([], expenses, "2026-01").expenses.TRY.toString()).toBe("0");
  });
});
