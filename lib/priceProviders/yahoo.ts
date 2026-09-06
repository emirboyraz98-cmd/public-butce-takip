import Decimal from "decimal.js";
import YahooFinance from "yahoo-finance2";

import type { AssetType, PriceProvider, PriceQuote } from "./types";

const yahooFinance = new YahooFinance();

export class YahooProvider implements PriceProvider {
  readonly source = "yahoo-finance2";

  supports(assetType: AssetType): boolean {
    return (
      assetType === "STOCK" ||
      assetType === "ETF" ||
      assetType === "FOREX" ||
      assetType === "COMMODITY"
    );
  }

  async getPrice(symbol: string): Promise<PriceQuote | null> {
    try {
      const quote = await yahooFinance.quote(symbol);
      if (!quote?.regularMarketPrice) return null;

      return {
        price: new Decimal(quote.regularMarketPrice),
        currency: quote.currency ?? "USD",
        source: this.source,
      };
    } catch {
      return null;
    }
  }
}
