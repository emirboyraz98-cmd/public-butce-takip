import type { AssetType } from "@/lib/priceProviders/types";
import type { SymbolPreset } from "./symbolPresets";

/** Yahoo'nun tür etiketinden bizim varlık türümüze. */
export const ASSET_TYPE_BY_QUOTE_TYPE: Record<string, AssetType> = {
  EQUITY: "STOCK",
  ETF: "ETF",
  CURRENCY: "FOREX",
  FUTURE: "COMMODITY",
};

/** Sonuç, hangi varlık türüne ait olduğunu kendisi taşır. */
export type TypedSymbolResult = SymbolPreset & { assetType: AssetType };

/** Yahoo aramasından dönen ham kayıtta bizim okuduğumuz alanlar. */
export type YahooQuoteLike = {
  symbol?: unknown;
  quoteType?: unknown;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
};

const MAX_CRYPTO = 6;

/**
 * İki kaynağın sonuçlarını tek listeye indirger.
 *
 * Kripto sonuçları ÖNDE: kullanıcı "BTC" yazdığında beklediği şey coin,
 * aynı harfleri taşıyan bir hisse değil. Tanımadığımız bir Yahoo tür
 * etiketi (INDEX, MUTUALFUND…) atlanıyor — fiyatlandıramadığımız bir
 * sembolü listelemek, seçilince fiyat gelmemesi demek.
 */
export function mergeSymbolResults(
  cryptoResults: readonly SymbolPreset[],
  yahooQuotes: readonly YahooQuoteLike[]
): TypedSymbolResult[] {
  const results: TypedSymbolResult[] = [];

  for (const item of cryptoResults.slice(0, MAX_CRYPTO)) {
    results.push({ ...item, assetType: "CRYPTO" });
  }

  for (const quote of yahooQuotes) {
    if (typeof quote.symbol !== "string" || typeof quote.quoteType !== "string") {
      continue;
    }
    const assetType = ASSET_TYPE_BY_QUOTE_TYPE[quote.quoteType];
    if (!assetType) continue;

    results.push({
      value: quote.symbol,
      label: [quote.shortname ?? quote.longname, quote.exchDisp]
        .filter(Boolean)
        .join(" — "),
      assetType,
    });
  }

  // Aynı sembol iki kaynaktan da gelebiliyor; ilk gelen kalıyor.
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.assetType}|${r.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
