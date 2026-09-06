import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tcmbRateSnapshot: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

const { getMonthlyAverageUsdTryRateWithFallback } = await import("./monthlyAverage");

function snapshot(date: string, usdSale: string) {
  return { date: new Date(`${date}T00:00:00Z`), usdSale };
}

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
});

describe("getMonthlyAverageUsdTryRateWithFallback", () => {
  it("ayın kendi verisi varsa onun ortalamasını kullanır, yedeğe düşmez", async () => {
    findMany.mockResolvedValueOnce([
      snapshot("2026-07-01", "40.00"),
      snapshot("2026-07-02", "42.00"),
    ]);

    const result = await getMonthlyAverageUsdTryRateWithFallback("2026-07");

    expect(result.rate.toFixed(2)).toBe("41.00");
    expect(result.sourceMonth).toBe("2026-07");
    expect(result.isFallback).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("ayın verisi yoksa en son geçmiş ayın ortalamasına düşer", async () => {
    // 1) hedef ay (2026-09) boş
    findMany.mockResolvedValueOnce([]);
    // 2) en son geçmiş snapshot -> 2026-07
    findFirst.mockResolvedValueOnce(snapshot("2026-07-31", "44.00"));
    // 3) o ayın tüm günleri
    findMany.mockResolvedValueOnce([
      snapshot("2026-07-30", "43.00"),
      snapshot("2026-07-31", "45.00"),
    ]);

    const result = await getMonthlyAverageUsdTryRateWithFallback("2026-09");

    expect(result.rate.toFixed(2)).toBe("44.00");
    expect(result.sourceMonth).toBe("2026-07");
    expect(result.isFallback).toBe(true);
  });

  it("ne hedef ayda ne de geçmişte veri varsa hata verir", async () => {
    findMany.mockResolvedValueOnce([]);
    findFirst.mockResolvedValueOnce(null);

    await expect(
      getMonthlyAverageUsdTryRateWithFallback("2026-09")
    ).rejects.toThrow(/yedek olarak kullanılabilecek geçmiş bir ay da yok/);
  });

  it("yedek ararken sadece hedef aydan ÖNCEsine bakar", async () => {
    findMany.mockResolvedValueOnce([]);
    findFirst.mockResolvedValueOnce(snapshot("2026-07-31", "44.00"));
    findMany.mockResolvedValueOnce([snapshot("2026-07-31", "44.00")]);

    await getMonthlyAverageUsdTryRateWithFallback("2026-09");

    const where = findFirst.mock.calls[0][0].where;
    expect(where.date.lt).toEqual(new Date(Date.UTC(2026, 8, 1)));
  });
});
