import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { fetchFxRate } from "./getRate";

export const FX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

export type Currency = "TRY" | "USD";

async function getOrFetchRate(base: Currency, quote: Currency): Promise<Decimal> {
  if (base === quote) return new Decimal(1);

  const cached = await prisma.fxRateSnapshot.findUnique({
    where: { base_quote: { base, quote } },
  });

  const isFresh = cached && Date.now() - cached.fetchedAt.getTime() < FX_CACHE_TTL_MS;
  if (isFresh) return new Decimal(cached.rate.toString());

  const rate = await fetchFxRate(base, quote);
  if (rate) {
    const saved = await prisma.fxRateSnapshot.upsert({
      where: { base_quote: { base, quote } },
      create: { base, quote, rate: rate.toString() },
      update: { rate: rate.toString(), fetchedAt: new Date() },
    });
    return new Decimal(saved.rate.toString());
  }

  if (cached) return new Decimal(cached.rate.toString());

  throw new Error(`${base} -> ${quote} kuru alınamadı`);
}

export async function convert(
  amount: Decimal | number | string,
  from: Currency,
  to: Currency
): Promise<Decimal> {
  const rate = await getOrFetchRate(from, to);
  return new Decimal(amount).mul(rate);
}
