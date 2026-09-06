import { prisma } from "@/lib/prisma";
import { getPriceProvider, type AssetType } from "@/lib/priceProviders";

export const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function refreshPrice(symbol: string, assetType: AssetType) {
  if (assetType === "MANUAL") {
    throw new Error(
      `${symbol}: bu varlık için otomatik fiyat çekimi yok, fiyatı elle gir`
    );
  }

  const provider = getPriceProvider(assetType, symbol);
  const quote = await provider.getPrice(symbol);
  if (!quote) {
    throw new Error(`${symbol}: fiyat bulunamadı, sembol formatını kontrol et`);
  }

  // Güncel fiyatın yanında günlük arşiv de tutulur; geçmiş ayların portföy
  // değeri ancak o günün fiyatıyla doğru hesaplanabilir.
  const today = new Date();
  const dateOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  const [snapshot] = await Promise.all([
    prisma.priceSnapshot.upsert({
      where: { symbol_assetType: { symbol, assetType } },
      create: {
        symbol,
        assetType,
        price: quote.price.toString(),
        currency: quote.currency,
        source: quote.source,
      },
      update: {
        price: quote.price.toString(),
        currency: quote.currency,
        source: quote.source,
        fetchedAt: new Date(),
      },
    }),
    prisma.priceHistory.upsert({
      where: {
        symbol_assetType_date: { symbol, assetType, date: dateOnly },
      },
      create: {
        symbol,
        assetType,
        date: dateOnly,
        price: quote.price.toString(),
        currency: quote.currency,
      },
      update: {
        price: quote.price.toString(),
        currency: quote.currency,
      },
    }),
  ]);

  return snapshot;
}

async function getOrRefreshPriceInternal(
  symbol: string,
  assetType: AssetType,
  ttlMs: number
) {
  const cached = await prisma.priceSnapshot.findUnique({
    where: { symbol_assetType: { symbol, assetType } },
  });

  const isFresh = cached && Date.now() - cached.fetchedAt.getTime() < ttlMs;
  if (isFresh) return { snapshot: cached, error: null as string | null };

  if (assetType === "MANUAL") {
    return {
      snapshot: cached,
      error: cached ? null : "Fiyat henüz girilmedi",
    };
  }

  try {
    return { snapshot: await refreshPrice(symbol, assetType), error: null };
  } catch (err) {
    return {
      snapshot: cached,
      error: err instanceof Error ? err.message : "Fiyat çekilemedi",
    };
  }
}

export async function getOrRefreshPrice(
  symbol: string,
  assetType: AssetType,
  ttlMs: number = PRICE_CACHE_TTL_MS
) {
  const { snapshot } = await getOrRefreshPriceInternal(symbol, assetType, ttlMs);
  return snapshot;
}

export async function getOrRefreshPriceWithStatus(
  symbol: string,
  assetType: AssetType,
  ttlMs: number = PRICE_CACHE_TTL_MS
) {
  return getOrRefreshPriceInternal(symbol, assetType, ttlMs);
}
