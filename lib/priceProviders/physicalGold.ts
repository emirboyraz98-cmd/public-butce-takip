import Decimal from "decimal.js";

import type { AssetType, PriceProvider, PriceQuote } from "./types";
import { YahooProvider } from "./yahoo";
import { fetchFxRate } from "@/lib/fx/getRate";

const TROY_OUNCE_IN_GRAMS = new Decimal("31.1034768");
const HAS_ALTIN_URL = "https://www.hasaltin.com/";
const HAS_ALTIN_SOURCE = "hasaltin.com (kapalıçarşı, alış/satış ortalaması)";
const FALLBACK_SOURCE = "hesaplanan (ons altın × USD/TRY, tahmini)";

/**
 * hasaltin.com'un "Has Altın / TL" (gram) ve sarrafiye satırlarındaki
 * <div class="name">AD</div> ... Alış: <b>X</b> ... Satış: <b>Y</b> kalıbını
 * yakalar. Site bir JSON API sunmuyor, fiyatlar doğrudan HTML'e gömülü ve
 * sayfa 60 sn'de bir kendiliğinden yenileniyor.
 */
const HAS_ALTIN_NAME_TO_SYMBOL: Record<string, string> = {
  "Has Altın / TL": "GRAM-ALTIN",
  "Çeyrek Altın": "CEYREK-ALTIN",
  "Yarım Altın": "YARIM-ALTIN",
  "Tam Altın": "TAM-ALTIN",
};

const HAS_ALTIN_ROW_PATTERN =
  /<div class="name">([^<]+)<\/div>[\s\S]*?Alış:\s*<\/span>\s*<b>([\d.,]+)<\/b>[\s\S]*?Satış:\s*<\/span>\s*<b>([\d.,]+)<\/b>/g;

function parseTurkishNumber(raw: string): Decimal {
  // Türkçe biçim: "." binlik ayraç (varsa), "," ondalık ayraç.
  return new Decimal(raw.replace(/\./g, "").replace(",", "."));
}

export function parseHasAltinHtml(html: string): Record<string, Decimal> | null {
  const prices: Record<string, Decimal> = {};
  for (const match of html.matchAll(HAS_ALTIN_ROW_PATTERN)) {
    const [, rawName, rawAlis, rawSatis] = match;
    const symbol = HAS_ALTIN_NAME_TO_SYMBOL[rawName.trim()];
    if (!symbol) continue;

    const alis = parseTurkishNumber(rawAlis);
    const satis = parseTurkishNumber(rawSatis);
    prices[symbol] = alis.add(satis).div(2);
  }

  return Object.keys(prices).length > 0 ? prices : null;
}

async function fetchHasAltinPrices(): Promise<Record<string, Decimal> | null> {
  try {
    const res = await fetch(HAS_ALTIN_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return parseHasAltinHtml(await res.text());
  } catch {
    return null;
  }
}

/**
 * Kuyumcudan fiziksel alınan altın türevleri (gram/çeyrek/yarım/tam) için
 * TRY fiyatı. Öncelik hasaltin.com'un kapalıçarşı alış/satış
 * kotasyonlarının ortalaması (gerçek piyasa fiyatı, işçilik/marj dahil).
 * O sayfa erişilemez/format değişirse, ons altın (Yahoo GC=F) × USD/TRY
 * kurundan hesaplanan bir TAHMİNE düşer — bu, has altın değeridir ve
 * kuyumcu marjını içermez.
 */
const GRAM_WEIGHTS: Record<string, Decimal> = {
  "GRAM-ALTIN": new Decimal(1),
  "CEYREK-ALTIN": new Decimal("1.75"),
  "YARIM-ALTIN": new Decimal("3.5"),
  "TAM-ALTIN": new Decimal("7.2"),
};

export class PhysicalGoldProvider implements PriceProvider {
  readonly source = HAS_ALTIN_SOURCE;
  private readonly yahoo = new YahooProvider();

  supports(assetType: AssetType, symbol: string): boolean {
    return assetType === "COMMODITY" && symbol.toUpperCase() in GRAM_WEIGHTS;
  }

  async getPrice(symbol: string): Promise<PriceQuote | null> {
    const key = symbol.toUpperCase();
    if (!(key in GRAM_WEIGHTS)) return null;

    const hasAltinPrices = await fetchHasAltinPrices();
    const scraped = hasAltinPrices?.[key];
    if (scraped) {
      return { price: scraped, currency: "TRY", source: HAS_ALTIN_SOURCE };
    }

    return this.getFallbackPrice(key);
  }

  private async getFallbackPrice(key: string): Promise<PriceQuote | null> {
    const [ounceQuote, usdTryRate] = await Promise.all([
      this.yahoo.getPrice("GC=F"),
      fetchFxRate("USD", "TRY"),
    ]);
    if (!ounceQuote || !usdTryRate) return null;

    const gramTry = ounceQuote.price.div(TROY_OUNCE_IN_GRAMS).mul(usdTryRate);
    return { price: gramTry.mul(GRAM_WEIGHTS[key]), currency: "TRY", source: FALLBACK_SOURCE };
  }
}
