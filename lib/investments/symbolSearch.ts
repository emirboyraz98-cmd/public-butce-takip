"use server";

import YahooFinance from "yahoo-finance2";

import { auth } from "@/auth";
import type { AssetType } from "@/lib/priceProviders/types";
import type { SymbolPreset } from "./symbolPresets";
import {
  mergeSymbolResults,
  type TypedSymbolResult,
  type YahooQuoteLike,
} from "./mergeSymbolResults";

export type { TypedSymbolResult };

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const YAHOO_QUOTE_TYPE: Partial<Record<AssetType, string>> = {
  STOCK: "EQUITY",
  ETF: "ETF",
  FOREX: "CURRENCY",
  COMMODITY: "FUTURE",
};

/**
 * Sembol kutusundaki sabit preset listesi sadece en sık kullanılanları
 * kapsar; BIST'teki her hisse (örn. ECZYT) veya az bilinen bir coin gibi
 * listede olmayanlar için canlı arama yapılır. Fiyat çekiminde kullanılan
 * kaynaklarla aynısı sorgulanır: Yahoo Finance (hisse/ETF/forex/emtia) ve
 * CoinGecko (kripto) — böylece dönen sembol otomatik fiyatlanabilir olur.
 */
export async function searchSymbols(
  assetType: AssetType,
  query: string
): Promise<SymbolPreset[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  try {
    if (assetType === "CRYPTO") return await searchCoinGecko(q);

    const quoteType = YAHOO_QUOTE_TYPE[assetType];
    if (!quoteType) return [];

    const result = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0 });
    return result.quotes
      .filter(
        (quote): quote is typeof quote & { symbol: string; quoteType: string } =>
          "symbol" in quote && "quoteType" in quote && quote.quoteType === quoteType
      )
      .map((quote) => ({
        value: quote.symbol,
        label: [quote.shortname ?? quote.longname, quote.exchDisp]
          .filter(Boolean)
          .join(" — "),
      }));
  } catch {
    return [];
  }
}

/**
 * Varlık türü SEÇMEDEN arama.
 *
 * Önce tür seçilmek zorundaydı ve yanlış tür seçilince aranan sembol hiç
 * bulunmuyordu — kullanıcı aradığını bulana kadar türleri tek tek denemek
 * zorunda kalıyordu. Oysa tür, bulunan sembolün bir ÖZELLİĞİ: sonuçtan
 * okunabiliyor. Artık her iki kaynak birden sorgulanıyor ve seçilen sonuç
 * türü de beraberinde getiriyor.
 *
 * İki kaynak paralel sorgulanıyor; biri hata verirse diğerinin sonuçları
 * yine de dönüyor (`allSettled`). Kripto sonuçları önde: kullanıcı "BTC"
 * yazdığında beklediği şey coin, aynı harfleri taşıyan bir hisse değil.
 */
export async function searchAllSymbols(
  query: string
): Promise<TypedSymbolResult[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const [crypto, yahoo] = await Promise.allSettled([
    searchCoinGecko(q),
    yahooFinance.search(q, { quotesCount: 12, newsCount: 0 }),
  ]);

  return mergeSymbolResults(
    crypto.status === "fulfilled" ? crypto.value : [],
    // Yahoo'nun birleşim tipi bizim okuduğumuz alanlarla örtüşmüyor
    // (bazı üyeler `symbol` taşımıyor); daraltma mergeSymbolResults içinde
    // alan alan yapılıyor.
    yahoo.status === "fulfilled"
      ? (yahoo.value.quotes as unknown as YahooQuoteLike[])
      : []
  );
}

async function searchCoinGecko(query: string): Promise<SymbolPreset[]> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    coins?: { id: string; symbol: string; name: string }[];
  };
  return (data.coins ?? [])
    .slice(0, 10)
    .map((coin) => ({ value: coin.id, label: `${coin.name} — ${coin.symbol.toUpperCase()}` }));
}
