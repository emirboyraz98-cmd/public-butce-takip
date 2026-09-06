import { describe, expect, it } from "vitest";

import { mergeSymbolResults } from "./mergeSymbolResults";

describe("mergeSymbolResults", () => {
  it("kripto sonuçlarını önce sıralar", () => {
    const r = mergeSymbolResults(
      [{ value: "bitcoin", label: "Bitcoin — BTC" }],
      [{ symbol: "BTC", quoteType: "EQUITY", shortname: "Some Corp" }]
    );
    // "BTC" yazan kullanıcı coin arıyor; aynı harfleri taşıyan hisse değil.
    expect(r[0].assetType).toBe("CRYPTO");
    expect(r[1].assetType).toBe("STOCK");
  });

  it("Yahoo tür etiketini varlık türüne çevirir", () => {
    const r = mergeSymbolResults(
      [],
      [
        { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple" },
        { symbol: "SPY", quoteType: "ETF", shortname: "SPDR" },
        { symbol: "EURUSD=X", quoteType: "CURRENCY", shortname: "EUR/USD" },
        { symbol: "GC=F", quoteType: "FUTURE", shortname: "Gold" },
      ]
    );
    expect(r.map((x) => x.assetType)).toEqual([
      "STOCK",
      "ETF",
      "FOREX",
      "COMMODITY",
    ]);
  });

  it("tanımadığı tür etiketini atlar", () => {
    // Fiyatlandıramadığımız bir sembolü listelemek, seçilince fiyatın
    // hiç gelmemesi demek.
    const r = mergeSymbolResults(
      [],
      [
        { symbol: "^GSPC", quoteType: "INDEX", shortname: "S&P 500" },
        { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple" },
      ]
    );
    expect(r.map((x) => x.value)).toEqual(["AAPL"]);
  });

  it("sembolü olmayan kaydı atlar", () => {
    const r = mergeSymbolResults([], [{ quoteType: "EQUITY" }, { symbol: 5 }]);
    expect(r).toEqual([]);
  });

  it("aynı tür + sembol tekrarını teke indirir", () => {
    const r = mergeSymbolResults(
      [],
      [
        { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple" },
        { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple Inc" },
      ]
    );
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe("Apple");
  });

  it("aynı sembolü FARKLI türde ayrı tutar", () => {
    // BTC hem coin hem hisse olabilir; ikisi ayrı varlık.
    const r = mergeSymbolResults(
      [{ value: "BTC", label: "Bitcoin" }],
      [{ symbol: "BTC", quoteType: "EQUITY", shortname: "Grayscale" }]
    );
    expect(r).toHaveLength(2);
  });

  it("etiketi ad ve borsadan kurar, eksikleri atlar", () => {
    const r = mergeSymbolResults(
      [],
      [
        { symbol: "THYAO.IS", quoteType: "EQUITY", longname: "Turk Hava", exchDisp: "Istanbul" },
        { symbol: "X", quoteType: "EQUITY" },
      ]
    );
    expect(r[0].label).toBe("Turk Hava — Istanbul");
    expect(r[1].label).toBe("");
  });

  it("kripto sonuçlarını altıyla sınırlar", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      value: `c${i}`,
      label: `Coin ${i}`,
    }));
    expect(mergeSymbolResults(many, [])).toHaveLength(6);
  });
});
