import type { AssetType } from "@/lib/priceProviders/types";

export type SymbolPreset = { value: string; label: string };

/** Sık kullanılan semboller: sembol formatını ezberlemek yerine listeden seçilebilsin diye. */
export const SYMBOL_PRESETS: Record<AssetType, SymbolPreset[]> = {
  CRYPTO: [
    { value: "BTC", label: "Bitcoin" },
    { value: "ETH", label: "Ethereum" },
    { value: "USDT", label: "Tether" },
    { value: "SOL", label: "Solana" },
    { value: "PAXG", label: "Pax Gold (1 ons altına bağlı token)" },
    { value: "XAUT", label: "Tether Gold (1 ons altına bağlı token)" },
  ],
  STOCK: [
    { value: "AAPL", label: "Apple" },
    { value: "MSFT", label: "Microsoft" },
    { value: "NVDA", label: "Nvidia" },
    { value: "GOOGL", label: "Alphabet (Google) Class A" },
    { value: "AMZN", label: "Amazon" },
    { value: "META", label: "Meta Platforms" },
    { value: "TSLA", label: "Tesla" },
    { value: "THYAO.IS", label: "Türk Hava Yolları (BIST)" },
    { value: "GARAN.IS", label: "Garanti BBVA (BIST)" },
  ],
  ETF: [
    { value: "SPY", label: "S&P 500 ETF" },
    { value: "QQQ", label: "Nasdaq 100 ETF" },
    { value: "VOO", label: "Vanguard S&P 500 ETF" },
  ],
  FOREX: [{ value: "EURUSD=X", label: "Euro/Dolar" }],
  COMMODITY: [
    { value: "GC=F", label: "Ons Altın (vadeli işlem, USD)" },
    { value: "SI=F", label: "Gümüş (vadeli işlem, USD)" },
    { value: "GRAM-ALTIN", label: "Fiziksel gram altın — hasaltin.com TL fiyatı" },
    { value: "CEYREK-ALTIN", label: "Fiziksel çeyrek altın — hasaltin.com TL fiyatı" },
    { value: "YARIM-ALTIN", label: "Fiziksel yarım altın — hasaltin.com TL fiyatı" },
    { value: "TAM-ALTIN", label: "Fiziksel tam altın — hasaltin.com TL fiyatı" },
  ],
  MANUAL: [],
};
