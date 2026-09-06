import Decimal from "decimal.js";

export type AssetType = "CRYPTO" | "STOCK" | "ETF" | "FOREX" | "COMMODITY" | "MANUAL";

export type PriceQuote = {
  price: Decimal;
  currency: string;
  source: string;
};

export interface PriceProvider {
  readonly source: string;
  supports(assetType: AssetType, symbol: string): boolean;
  getPrice(symbol: string): Promise<PriceQuote | null>;
}
