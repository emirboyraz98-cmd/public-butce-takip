import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  accrualMonthForCashMonth,
  salaryForCashMonth,
  shiftMonth,
  type SalaryEntry,
} from "./salaryTiming";

describe("shiftMonth", () => {
  it("ay ekler", () => {
    expect(shiftMonth("2026-07", 1)).toBe("2026-08");
  });

  it("ay çıkarır", () => {
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
  });

  it("yıl sınırını ileri doğru aşar", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("yıl sınırını geri doğru aşar", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("birden fazla ay kaydırır", () => {
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
    expect(shiftMonth("2026-02", -3)).toBe("2025-11");
  });

  it("sıfır kaydırmada ayı değiştirmez", () => {
    expect(shiftMonth("2026-07", 0)).toBe("2026-07");
  });
});

describe("accrualMonthForCashMonth", () => {
  it("gecikme yokken hak ediş ayı = nakit ayı", () => {
    expect(accrualMonthForCashMonth("2026-08", 0)).toBe("2026-08");
  });

  it("1 ay gecikmede ağustos nakdi temmuzun maaşıdır", () => {
    // Kullanıcının durumu: temmuz maaşı 12 ağustosta yatıyor.
    expect(accrualMonthForCashMonth("2026-08", 1)).toBe("2026-07");
  });

  it("2 ay gecikmeyi de destekler", () => {
    expect(accrualMonthForCashMonth("2026-08", 2)).toBe("2026-06");
  });

  it("yıl başında bir önceki yıla geçer", () => {
    expect(accrualMonthForCashMonth("2026-01", 1)).toBe("2025-12");
  });
});

describe("salaryForCashMonth", () => {
  /** Ay -> kur eşlemesi; hangi ayın kuruyla çevrildiğini görünür kılar. */
  const RATES: Record<string, number> = {
    "2026-06": 20,
    "2026-07": 30,
    "2026-08": 50,
  };

  const toBase = (amount: Decimal, currency: string, month: string) =>
    currency === "USD" ? amount.mul(RATES[month] ?? 0) : amount;

  const salaries = new Map<string, SalaryEntry>([
    ["2026-06", { amount: "1000", currency: "USD" }],
    ["2026-07", { amount: "1000", currency: "USD" }],
  ]);

  it("çevrimi HAK EDİŞ ayının kuruyla yapar, ödendiği ayınkiyle değil", () => {
    // Temmuz maaşı ağustosta ödeniyor. Temmuz kuru 30, ağustos kuru 50.
    // Doğru sonuç 1000 × 30 = 30.000'dir; 50.000 çıkarsa ödeme ayının kuru
    // kullanılmış demektir.
    const result = salaryForCashMonth({
      cashMonth: "2026-08",
      offset: 1,
      salaryByAccrualMonth: salaries,
      toBase,
    });

    expect(result.accrualMonth).toBe("2026-07");
    expect(result.amount.toNumber()).toBe(30000);
    expect(result.amount.toNumber()).not.toBe(50000);
  });

  it("gecikme yokken ayın kendi kurunu kullanır", () => {
    const result = salaryForCashMonth({
      cashMonth: "2026-07",
      offset: 0,
      salaryByAccrualMonth: salaries,
      toBase,
    });

    expect(result.accrualMonth).toBe("2026-07");
    expect(result.amount.toNumber()).toBe(30000);
  });

  it("2 ay gecikmede iki ay öncesinin kuruyla çevirir", () => {
    const result = salaryForCashMonth({
      cashMonth: "2026-08",
      offset: 2,
      salaryByAccrualMonth: salaries,
      toBase,
    });

    expect(result.accrualMonth).toBe("2026-06");
    expect(result.amount.toNumber()).toBe(20000); // 1000 × 20
  });

  it("hak ediş ayında maaş yoksa sıfır döner", () => {
    // offset 1 iken temmuz sütununda haziranın maaşı... var; ama haziran
    // sütununda mayısınki aranır ve yoktur.
    const result = salaryForCashMonth({
      cashMonth: "2026-06",
      offset: 1,
      salaryByAccrualMonth: salaries,
      toBase,
    });

    expect(result.accrualMonth).toBe("2026-05");
    expect(result.found).toBe(false);
    expect(result.amount.toNumber()).toBe(0);
  });

  it("çevrim fonksiyonuna hak ediş ayını geçirir", () => {
    // Kur seçiminin yanlışlıkla nakit ayına çevrilmesini doğrudan yakalar.
    const seenMonths: string[] = [];
    salaryForCashMonth({
      cashMonth: "2026-08",
      offset: 1,
      salaryByAccrualMonth: salaries,
      toBase: (amount, _currency, month) => {
        seenMonths.push(month);
        return amount;
      },
    });

    expect(seenMonths).toEqual(["2026-07"]);
  });

  it("baz para birimindeki maaşı çevirmeden bırakır", () => {
    const tryOnly = new Map<string, SalaryEntry>([
      ["2026-07", { amount: "200000", currency: "TRY" }],
    ]);

    const result = salaryForCashMonth({
      cashMonth: "2026-08",
      offset: 1,
      salaryByAccrualMonth: tryOnly,
      toBase,
    });

    expect(result.amount.toNumber()).toBe(200000);
  });
});
