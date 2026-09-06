import { describe, expect, it } from "vitest";

import { monthLengthAdjustmentDays } from "./dailyFormula";
import { computeMonthNominal } from "./computeMonth";
import type { WorkPeriodLike } from "./holidayCalendar";

const BASE_SALARY = 3000;
// saatlik = 3000 / 225 = 13.3333..., normal gün = 11.25 × saatlik = 150
const NORMAL_DAY_USD = 150;

const rates = [
  { amount: BASE_SALARY, effectiveFrom: new Date("2020-01-01"), effectiveTo: null },
];

function worked(from: string, to: string): WorkPeriodLike {
  return {
    startDate: new Date(`${from}T00:00:00Z`),
    endDate: new Date(`${to}T00:00:00Z`),
    type: "WORKED",
  };
}

function leave(from: string, to: string): WorkPeriodLike {
  return {
    startDate: new Date(`${from}T00:00:00Z`),
    endDate: new Date(`${to}T00:00:00Z`),
    type: "LEAVE",
  };
}

describe("monthLengthAdjustmentDays", () => {
  it("31 günlük ayda bir normal gün düşer", () => {
    expect(monthLengthAdjustmentDays(31)).toBe(-1);
  });

  it("30 günlük ayda düzeltme yoktur", () => {
    expect(monthLengthAdjustmentDays(30)).toBe(0);
  });

  it("29 günlük ayda (artık yıl şubatı) bir gün eklenir", () => {
    expect(monthLengthAdjustmentDays(29)).toBe(1);
  });

  it("28 günlük şubatta iki gün eklenir", () => {
    expect(monthLengthAdjustmentDays(28)).toBe(2);
  });

  it("düşülecek normal gün yoksa negatife inmez", () => {
    // 31 günlük ayın tamamı izinliyse çıkarılacak normal gün yok.
    expect(monthLengthAdjustmentDays(31, 0)).toBe(0);
  });

  it("elde olandan fazla gün düşmez", () => {
    expect(monthLengthAdjustmentDays(31, 1)).toBe(-1);
  });
});

describe("computeMonthNominal — ay uzunluğu düzeltmesi", () => {
  it("31 günlük ayda normal gün sayısını 1 azaltır", () => {
    // Mart 2026: 31 gün, tamamı çalışılmış.
    const result = computeMonthNominal(
      "2026-03",
      [worked("2026-03-01", "2026-03-31")],
      rates,
      new Set()
    );

    expect(result.monthLengthAdjustment).toBe(-1);
    // Takvimde 31 gün var; sayılan normal + pazar + düzeltme = 30 gün
    const counted =
      result.dayTypeCounts.NORMAL +
      result.dayTypeCounts.SUNDAY +
      result.dayTypeCounts.PUBLIC_HOLIDAY +
      result.dayTypeCounts.LEAVE;
    expect(counted).toBe(30);
    expect(result.monthLengthAdjustmentUsd.toNumber()).toBe(-NORMAL_DAY_USD);
  });

  it("30 günlük ayı olduğu gibi bırakır", () => {
    const result = computeMonthNominal(
      "2026-04",
      [worked("2026-04-01", "2026-04-30")],
      rates,
      new Set()
    );

    expect(result.monthLengthAdjustment).toBe(0);
    expect(result.monthLengthAdjustmentUsd.toNumber()).toBe(0);
  });

  it("28 günlük şubatta normal güne 2 gün ekler", () => {
    const result = computeMonthNominal(
      "2026-02",
      [worked("2026-02-01", "2026-02-28")],
      rates,
      new Set()
    );

    expect(result.monthLengthAdjustment).toBe(2);
    const counted =
      result.dayTypeCounts.NORMAL +
      result.dayTypeCounts.SUNDAY +
      result.dayTypeCounts.PUBLIC_HOLIDAY +
      result.dayTypeCounts.LEAVE;
    expect(counted).toBe(30);
    expect(result.monthLengthAdjustmentUsd.toNumber()).toBe(2 * NORMAL_DAY_USD);
  });

  it("izin ve resmi tatil gün sayılarına DOKUNMAZ", () => {
    // Kullanıcının verdiği örnek: 31 günlük ayda 11 izin + 10 resmi tatil +
    // 10 normal çalışma. 30'a çevirirken normal 9'a düşmeli, diğerleri aynı.
    // Pazarlar (1, 8, 15, 22, 29) kasten dışarıda: pazar resmi tatilden önce
    // geliyor, araya bir pazar girseydi resmi tatil sayısı 10 olmazdı ve test
    // ölçmek istediği şeyi değil o çakışmayı ölçerdi.
    const holidays = new Set([
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-16",
      "2026-03-17",
      "2026-03-18",
      "2026-03-19",
      "2026-03-20",
      "2026-03-21",
      "2026-03-23",
    ]);

    const result = computeMonthNominal(
      "2026-03",
      [
        leave("2026-03-01", "2026-03-11"), // 11 gün izin
        worked("2026-03-12", "2026-03-31"), // 20 gün: 10'u resmi tatil
      ],
      rates,
      holidays
    );

    expect(result.dayTypeCounts.LEAVE).toBe(11);
    expect(result.dayTypeCounts.PUBLIC_HOLIDAY).toBe(10);
    expect(result.monthLengthAdjustment).toBe(-1);

    // Kalan 10 gün normal/pazar olarak dağılır; düzeltme sonrası toplam 30.
    const counted =
      result.dayTypeCounts.NORMAL +
      result.dayTypeCounts.SUNDAY +
      result.dayTypeCounts.PUBLIC_HOLIDAY +
      result.dayTypeCounts.LEAVE;
    expect(counted).toBe(30);
  });

  it("saatlik ücret 225'te sabit kalır (ay uzunluğuna göre değişmez)", () => {
    // Aynı gün tipi, farklı uzunluktaki iki ayda aynı günlük tutarı vermeli.
    const march = computeMonthNominal(
      "2026-03",
      [worked("2026-03-02", "2026-03-02")],
      rates,
      new Set()
    );
    const april = computeMonthNominal(
      "2026-04",
      [worked("2026-04-01", "2026-04-01")],
      rates,
      new Set()
    );

    expect(march.breakdown[0].amountUsd).toBe(april.breakdown[0].amountUsd);
    expect(Number(march.breakdown[0].amountUsd)).toBe(NORMAL_DAY_USD);
  });

  it("31 günlük ayın tamamı izinliyse düzeltme uygulanmaz", () => {
    const result = computeMonthNominal(
      "2026-03",
      [leave("2026-03-01", "2026-03-31")],
      rates,
      new Set()
    );

    expect(result.dayTypeCounts.NORMAL).toBe(0);
    expect(result.monthLengthAdjustment).toBe(0);
    expect(result.monthLengthAdjustmentUsd.toNumber()).toBe(0);
  });

  it("ay kısmen girilmişse düzeltme UYGULANMAZ", () => {
    // Bordronun mantığı "izin + tatil + normal = ayın tamamı" varsayımına
    // dayanır. 31 günlük ayın yalnızca 5 günü girildiyse normalize edilecek
    // bir ay yoktur; gün düşmek girilmemiş günlerden kesinti yapmak olurdu.
    const result = computeMonthNominal(
      "2026-03",
      [worked("2026-03-02", "2026-03-06")],
      rates,
      new Set()
    );

    expect(result.monthLengthAdjustment).toBe(0);
    expect(result.dayTypeCounts.NORMAL).toBe(5);
    expect(result.usdNominalTotal.toNumber()).toBe(5 * NORMAL_DAY_USD);
  });

  it("kısmen girilmiş şubata gün EKLEMEZ (olmayan maaş uydurmaz)", () => {
    const result = computeMonthNominal(
      "2026-02",
      [worked("2026-02-02", "2026-02-06")],
      rates,
      new Set()
    );

    expect(result.monthLengthAdjustment).toBe(0);
    expect(result.usdNominalTotal.toNumber()).toBe(5 * NORMAL_DAY_USD);
  });

  it("hiç kayıt yoksa düzeltme de tutar da üretmez", () => {
    const result = computeMonthNominal("2026-03", [], rates, new Set());

    expect(result.usdNominalTotal.toNumber()).toBe(0);
    expect(result.monthLengthAdjustment).toBe(0);
  });
});
