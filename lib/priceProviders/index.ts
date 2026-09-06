import type { AssetType, PriceProvider } from "./types";
import { CoinGeckoProvider } from "./coingecko";
import { YahooProvider } from "./yahoo";
import { PhysicalGoldProvider } from "./physicalGold";
import { ManualProvider } from "./manual";

export type { AssetType, PriceProvider, PriceQuote } from "./types";

const providers: PriceProvider[] = [
  new CoinGeckoProvider(),
  // Fiziksel altın sembolleri (GRAM-ALTIN vb.) Yahoo'dan önce eşleşmeli.
  new PhysicalGoldProvider(),
  new YahooProvider(),
  new ManualProvider(),
];

export function getPriceProvider(assetType: AssetType, symbol: string): PriceProvider {
  const provider = providers.find((p) => p.supports(assetType, symbol));
  if (!provider) {
    throw new Error(`${assetType} için bir fiyat sağlayıcı tanımlı değil`);
  }
  return provider;
}
