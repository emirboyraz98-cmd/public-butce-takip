import { XMLParser } from "fast-xml-parser";
import Decimal from "decimal.js";
import { format } from "date-fns";

type TcmbCurrency = {
  "@_Kod": string;
  ForexSelling?: string | number;
};

type TcmbXml = {
  Tarih_Date?: {
    Currency: TcmbCurrency | TcmbCurrency[];
  };
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export function parseTcmbUsdSellingRate(xml: string): Decimal | null {
  const parsed = parser.parse(xml) as TcmbXml;
  const currencies = parsed.Tarih_Date?.Currency;
  if (!currencies) return null;

  const list = Array.isArray(currencies) ? currencies : [currencies];
  const usd = list.find((c) => c["@_Kod"] === "USD");
  if (!usd?.ForexSelling) return null;

  return new Decimal(usd.ForexSelling);
}

export function tcmbUrlForDate(date: Date): string {
  const yyyyMM = format(date, "yyyyMM");
  const ddMMyyyy = format(date, "ddMMyyyy");
  return `https://www.tcmb.gov.tr/kurlar/${yyyyMM}/${ddMMyyyy}.xml`;
}

/**
 * TCMB o gün için kur yayınlamamış olabilir (hafta sonu/resmi tatil).
 * Bu durumda null döner, hata fırlatmaz.
 */
export async function fetchTcmbUsdSellingRate(date: Date): Promise<Decimal | null> {
  const res = await fetch(tcmbUrlForDate(date), { cache: "no-store" });
  if (!res.ok) return null;

  const xml = await res.text();
  return parseTcmbUsdSellingRate(xml);
}
