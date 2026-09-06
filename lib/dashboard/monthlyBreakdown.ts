import Decimal from "decimal.js";

import { appliesToMonth, type Currency } from "@/lib/cashflow/calculations";

export type CategorizedEntry = {
  categoryName: string;
  amount: Decimal | number | string;
  currency: Currency;
  date: Date;
  frequency: "ONE_TIME" | "MONTHLY";
};

export type CategoryAmount = { category: string; amount: Decimal };

/**
 * Verilen ay için, girişleri kategoriye göre gruplayıp toplar. Tutarlar
 * çağıran tarafından zaten baz para birimine çevrilmiş olmalı (bu fonksiyon
 * kur dönüşümü yapmaz, sadece gruplar).
 */
export function groupByCategory(
  entries: { categoryName: string; amountInBase: Decimal }[]
): CategoryAmount[] {
  const totals = new Map<string, Decimal>();

  for (const entry of entries) {
    const current = totals.get(entry.categoryName) ?? new Decimal(0);
    totals.set(entry.categoryName, current.plus(entry.amountInBase));
  }

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

export function entriesForMonth(
  entries: CategorizedEntry[],
  month: string
): CategorizedEntry[] {
  return entries.filter((e) => appliesToMonth(e, month));
}

export type SourceGroup = {
  /** Kalemin geldiği yer: "Kredi Kartı", "Krediler", "Genel Giderler"… */
  source: string;
  items: CategoryAmount[];
  total: Decimal;
};

/**
 * Kalemleri önce KAYNAĞA, sonra kategoriye göre gruplar.
 *
 * Önceden üç gider kaynağı tek listede eriyordu ve nereden geldiği yalnızca
 * kategori adının önüne yazılan "Kart:" / "Kredi:" ekinden anlaşılıyordu.
 * Ek, kategori adını uzatıyor ve kaynak toplamlarını hiç göstermiyordu:
 * "bu ay karta ne kadar gitti" sorusu satırları gözle toplayarak
 * cevaplanıyordu.
 *
 * Kaynak sırası VERİ SIRASINI değil, çağıranın verdiği sırayı izler; böylece
 * arayüzde sabit bir okuma düzeni kurulabilir (boş kaynaklar düşer).
 */
export function groupBySource(
  groups: { source: string; entries: { categoryName: string; amountInBase: Decimal }[] }[]
): SourceGroup[] {
  return groups
    .map(({ source, entries }) => {
      const items = groupByCategory(entries);
      return {
        source,
        items,
        total: items.reduce((sum, i) => sum.plus(i.amount), new Decimal(0)),
      };
    })
    .filter((g) => g.items.length > 0);
}
