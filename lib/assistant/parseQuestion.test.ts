import { describe, expect, it } from "vitest";

import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/defaults";

import { parseQuestion, type ParsedQuestion } from "./parseQuestion";

// 13 Ekim 2026, salı.
const NOW = new Date("2026-10-13T09:00:00Z");
const VOCAB = {
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  incomeCategories: [...DEFAULT_INCOME_CATEGORIES, "Maaş"],
  loans: ["Konut Kredisi"],
};

function p(q: string): ParsedQuestion {
  const r = parseQuestion(q, NOW, VOCAB);
  if (!r) throw new Error(`çözümlenemedi: ${q}`);
  return r;
}

function ozet(q: string) {
  const r = p(q);
  return {
    intent: r.intent,
    metric: r.metric,
    cats: r.categories.map((c) => c.name),
    notes: r.noteTerms,
    source: r.source,
    from: r.time?.from ?? null,
    to: r.time?.to ?? null,
  };
}

/*
 * Kullanıcının gerçekte yazdığı türden 30 soru. Eski çözümleyici bunların
 * yalnızca 7'sini anlıyordu, 3'ünü de yanlış.
 */
describe("parseQuestion — temel 30 soru", () => {
  it.each<[string, Partial<ReturnType<typeof ozet>>]>([
    ["ne kadar harcadım", { intent: "total", metric: "expense", from: null }],
    ["markete ne kadar harcadım", { intent: "total", cats: ["Market"] }],
    ["en çok neye para harcadım", { intent: "top", metric: "expense" }],
    ["en büyük harcamam ne", { intent: "largest" }],
    ["geçen aya göre daha mı çok harcadım", { intent: "compare", metric: "expense" }],
    ["bu ay ne kadar kazandım", { intent: "total", metric: "income", from: "2026-10-01" }],
    ["maaşım ne kadar", { intent: "salary", metric: "income", source: "salary" }],
    ["bu ay kaç para biriktirdim", { intent: "total", metric: "net" }],
    ["dün ne harcadım", { intent: "total", from: "2026-10-12", to: "2026-10-12" }],
    ["son harcamalarım neler", { intent: "recent" }],
    ["kaç kere markete gittim", { intent: "count", cats: ["Market"] }],
    ["günlük ortalama ne kadar harcıyorum", { intent: "average" }],
    ["bütçemi aştım mı", { intent: "budget", cats: [] }],
    ["market bütçemden ne kadar kaldı", { intent: "budget", metric: "expense", cats: ["Market"] }],
    ["kira ne kadar", { intent: "total", metric: "expense", cats: ["Kira"] }],
    ["konser için ne ödedim", { intent: "total", notes: ["konser"], cats: [] }],
    ["bu yıl toplam ne harcadım", { intent: "total", from: "2026-01-01", to: "2026-10-31" }],
    ["hangi ay en çok harcadım", { intent: "bestPeriod" }],
    ["kredi kartıyla ne kadar harcadım", { intent: "total", source: "card" }],
    ["yemeğe ne kadar gidiyor", { intent: "total", cats: ["Yeme-İçme"] }],
    ["ulasima ne kadar harcadim", { intent: "total", cats: ["Ulaşım"] }],
    ["ekim ayında faturalara ne ödedim", { cats: ["Faturalar"], from: "2026-10-01", to: "2026-10-31" }],
    ["son 30 günde ne harcadım", { intent: "total", from: "2026-09-14", to: "2026-10-13" }],
    ["tasarruf oranım ne", { intent: "savingsRate", metric: "net" }],
    ["en son ne harcadım", { intent: "last" }],
    ["1 ekimden 10 ekime kadar ne harcadım", { from: "2026-10-01", to: "2026-10-10" }],
    ["geçen hafta sonu ne harcadım", { from: "2026-10-10", to: "2026-10-11" }],
    ["şimdiye kadar toplam ne harcadım", { intent: "total", from: "0000-01-01" }],
    ["eğlenceye ayda ortalama ne harcıyorum", { intent: "average", cats: ["Eğlence"] }],
    ["market yüzde kaç", { intent: "share", cats: ["Market"] }],
  ])("%s", (q, beklenen) => {
    expect(ozet(q)).toMatchObject(beklenen);
  });
});

describe("parseQuestion — ayrıntılar", () => {
  it("'ne harcadım' kalem ister, 'ne kadar' istemez", () => {
    expect(p("dün ne harcadım").wantsItems).toBe(true);
    expect(p("dün ne kadar harcadım").wantsItems).toBe(false);
  });

  it("karşılaştırmada 'X'e göre' denen dönem taban olur", () => {
    const r = p("bu ay geçen aya göre nasıl");
    expect(r.time?.from).toBe("2026-10-01");
    expect(r.baseline?.from).toBe("2026-09-01");
  });

  it("iki ay adı verilirse ikisi de alınır", () => {
    const r = p("eylül ile ekimi karşılaştır");
    expect([r.time?.from, r.time2?.from]).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("'kategorilere göre' karşılaştırma değil, kırılım", () => {
    expect(p("bu ay kategorilere göre harcamalarım")).toMatchObject({ intent: "top", wantsBreakdown: true });
  });

  it("tutar eşiği yıl sanılmaz", () => {
    const r = p("bu ay 2000 tl üstü harcama");
    expect(r.minAmount).toBe(2000);
    expect(r.time?.from).toBe("2026-10-01");
    expect(p("2 bin liradan fazla harcamalar").minAmount).toBe(2000);
    expect(p("100 liradan az harcamalarım").maxAmount).toBe(100);
    expect(p("1.000 TL üstü harcamalarım").minAmount).toBe(1000);
  });

  it("birden çok kategori", () => {
    expect(p("ulaşım ve market toplam ne kadar").categories.map((c) => c.name).sort()).toEqual(["Market", "Ulaşım"]);
  });

  it("'kira' gider sorusunda gider kategorisi, 'kira gelirim' gelir kategorisi", () => {
    expect(p("kira ne kadar").categories).toEqual([{ name: "Kira", side: "expense" }]);
    expect(p("kira gelirim ne kadar")).toMatchObject({ metric: "income", categories: [{ name: "Kira Geliri", side: "income" }] });
  });

  it("'faturalar ne kadar geldi' gelir değil", () => {
    expect(p("geçen ay faturalar ne kadar geldi").metric).toBe("expense");
    expect(p("doğalgaz ne kadar geldi").metric).toBe("expense");
    expect(p("ne kadar para geldi").metric).toBe("income");
  });

  it("kredi adı ve kredi sözcüğü kaynağı kredi yapar", () => {
    expect(p("konut kredisi ne kadar ödüyorum")).toMatchObject({ source: "loan", categories: [{ name: "Konut Kredisi" }] });
    expect(p("kredi taksitlerim ne kadar")).toMatchObject({ source: "loan", noteTerms: [] });
    // "kredi kartı" kredi değil.
    expect(p("kredi kartıyla ne kadar harcadım").source).toBe("card");
  });

  it("dolgu sözcükleri not araması sayılmaz", () => {
    for (const q of [
      "bu ay elimde ne kadar kaldı",
      "param nereye gidiyor",
      "en son markete ne zaman gittim",
      "bütçemde ne kadar kaldı",
      "kaç tane harcama girdim",
      "bu ay gelirim giderimi karşılıyor mu",
      "5-12 ekim arası harcamalarım",
      "mart ile nisan arasında ne harcadım",
    ]) {
      expect(p(q).noteTerms, q).toEqual([]);
    }
  });

  it("gelecek kipte yılı yazılmamış ay önümüzdeki aya düşer", () => {
    expect(p("kasımda ne kadar harcayacağım").time?.from).toBe("2026-11-01");
    expect(p("kasımda ne kadar harcadım").time?.from).toBe("2025-11-01");
  });

  it("son N harcama", () => {
    expect(p("son 10 harcamam")).toMatchObject({ intent: "recent", limit: 10 });
  });

  it("selamlaşma, teşekkür ve kapsam dışı", () => {
    expect(p("merhaba").intent).toBe("help");
    expect(p("ne sorabilirim").intent).toBe("help");
    expect(p("teşekkürler").intent).toBe("thanks");
    expect(p("dolar kaç").intent).toBe("outOfScope");
    expect(p("bu ay ne kadar yatırım yaptım").intent).toBe("outOfScope");
  });

  it("alakasız soruda tahmin yürütmez", () => {
    expect(parseQuestion("hava nasıl", NOW, VOCAB)).toBeNull();
    expect(parseQuestion("", NOW, VOCAB)).toBeNull();
  });

  it("kategori adının yalnızca bir parçası tek başına yetmez", () => {
    // "Borsa Kâr Realizasyonu" gelir kategorisi var; "borsa" piyasa sorusu.
    expect(p("borsa nasıl").intent).toBe("outOfScope");
    expect(p("borsa kâr realizasyonu gelirim").categories[0]?.name).toBe("Borsa Kâr Realizasyonu");
  });
});
