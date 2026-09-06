import { describe, expect, it } from "vitest";

import { parseTcmbUsdSellingRate } from "./tcmb";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="04.01.2026" Date="01/04/2026" Bulten_No="2026/1">
<Currency Kod="USD" CurrencyCode="USD">
<Unit>1</Unit>
<Isim>ABD DOLARI</Isim>
<CurrencyName>US DOLLAR</CurrencyName>
<ForexBuying>52.9800</ForexBuying>
<ForexSelling>53.0400</ForexSelling>
<BanknoteBuying>52.9000</BanknoteBuying>
<BanknoteSelling>53.1000</BanknoteSelling>
</Currency>
<Currency Kod="EUR" CurrencyCode="EUR">
<Unit>1</Unit>
<ForexBuying>57.1000</ForexBuying>
<ForexSelling>57.2000</ForexSelling>
</Currency>
</Tarih_Date>`;

describe("parseTcmbUsdSellingRate", () => {
  it("extracts the USD ForexSelling (Döviz Satış) rate", () => {
    const rate = parseTcmbUsdSellingRate(SAMPLE_XML);
    expect(rate?.toFixed(2)).toBe("53.04");
  });

  it("returns null when there is no Tarih_Date root", () => {
    expect(parseTcmbUsdSellingRate("<Empty/>")).toBeNull();
  });
});
