import type { AssetType, PriceProvider, PriceQuote } from "./types";

/**
 * BIST gibi ücretsiz güvenilir bir fiyat API'si olmayan varlıklar için:
 * otomatik çekim yapılmaz, fiyat kullanıcı tarafından elle girilir ve
 * doğrudan PriceSnapshot'a yazılır (bkz. investments/actions.ts setManualPrice).
 */
export class ManualProvider implements PriceProvider {
  readonly source = "manual";

  supports(assetType: AssetType): boolean {
    return assetType === "MANUAL";
  }

  async getPrice(): Promise<PriceQuote | null> {
    return null;
  }
}
