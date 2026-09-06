import Decimal from "decimal.js";

import type { AssetType, PriceProvider, PriceQuote } from "./types";

/**
 * CoinGecko public API sembol değil "coin id" bekler (örn. "bitcoin", "ethereum").
 * En yaygın ticker'lar için bir eşleme tutuyoruz; eşleşmeyen semboller,
 * kullanıcının CoinGecko id'sini doğrudan (küçük harf) girdiği varsayımıyla
 * olduğu gibi denenir.
 */
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  USDC: "usd-coin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  TRX: "tron",
  TON: "the-open-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  MATIC: "matic-network",
  LTC: "litecoin",
  SHIB: "shiba-inu",
  ATOM: "cosmos",
  UNI: "uniswap",
  XLM: "stellar",
  // 1 ons (troy ounce) altına bağlı, spot fiyatını izleyen kripto tokenlar —
  // "XAUUSDT" borsa çiftinin karşılığı olarak en yakın gerçek coin bunlar.
  PAXG: "pax-gold",
  XAUT: "tether-gold",
  XAUUSDT: "tether-gold",
};

function toCoinGeckoId(symbol: string): string {
  return SYMBOL_TO_COINGECKO_ID[symbol.toUpperCase()] ?? symbol.toLowerCase();
}

export class CoinGeckoProvider implements PriceProvider {
  readonly source = "coingecko";

  supports(assetType: AssetType): boolean {
    return assetType === "CRYPTO";
  }

  async getPrice(symbol: string): Promise<PriceQuote | null> {
    const id = toCoinGeckoId(symbol);
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, { usd?: number }>;
    const usdPrice = data[id]?.usd;
    if (usdPrice === undefined) return null;

    return { price: new Decimal(usdPrice), currency: "USD", source: this.source };
  }
}
