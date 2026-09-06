import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { groupBySource } from "./monthlyBreakdown";

const e = (categoryName: string, n: number) => ({
  categoryName,
  amountInBase: new Decimal(n),
});

describe("groupBySource", () => {
  it("kaynak başına kategorileri toplar ve kaynak toplamını verir", () => {
    const r = groupBySource([
      { source: "Kredi Kartı", entries: [e("Market", 100), e("Market", 50), e("Yakıt", 30)] },
      { source: "Genel Giderler", entries: [e("Kira", 900)] },
    ]);

    expect(r).toHaveLength(2);
    expect(r[0].source).toBe("Kredi Kartı");
    expect(r[0].items.map((i) => [i.category, i.amount.toNumber()])).toEqual([
      ["Market", 150],
      ["Yakıt", 30],
    ]);
    expect(r[0].total.toNumber()).toBe(180);
    expect(r[1].total.toNumber()).toBe(900);
  });

  it("boş kaynakları düşürür", () => {
    const r = groupBySource([
      { source: "Kredi Kartı", entries: [] },
      { source: "Krediler", entries: [e("Konut", 5000)] },
    ]);
    expect(r.map((g) => g.source)).toEqual(["Krediler"]);
  });

  it("kaynak sırası çağıranın verdiği sırayı korur (tutara göre değil)", () => {
    // Genel Giderler daha büyük ama sıralama bozulmamalı; arayüzde sabit
    // bir okuma düzeni isteniyor.
    const r = groupBySource([
      { source: "Kredi Kartı", entries: [e("Market", 10)] },
      { source: "Genel Giderler", entries: [e("Kira", 9000)] },
    ]);
    expect(r.map((g) => g.source)).toEqual(["Kredi Kartı", "Genel Giderler"]);
  });

  it("kategori içinde büyükten küçüğe sıralar", () => {
    const r = groupBySource([
      { source: "X", entries: [e("küçük", 5), e("büyük", 500), e("orta", 50)] },
    ]);
    expect(r[0].items.map((i) => i.category)).toEqual(["büyük", "orta", "küçük"]);
  });

  it("hepsi boşsa boş dizi döner", () => {
    expect(groupBySource([{ source: "X", entries: [] }])).toEqual([]);
  });
});
