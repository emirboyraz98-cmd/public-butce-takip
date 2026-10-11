import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { answerQuestion, occurrencesInRange, type AnswerEntry } from "./answer";
import { parseQuestion } from "./parseQuestion";

const NOW = new Date("2026-10-13T09:00:00Z");
const KATEGORILER = ["Kira", "Market", "Ulaşım"];

const gider = (
  date: string,
  categoryName: string,
  amount: number,
  frequency: "ONE_TIME" | "MONTHLY" = "ONE_TIME",
  recurrenceEndMonth: string | null = null
): AnswerEntry => ({
  date,
  categoryName,
  amountInBase: new Decimal(amount),
  frequency,
  recurrenceEndMonth,
});

const cevapla = (soru: string, expenses: AnswerEntry[], incomes: AnswerEntry[] = []) => {
  const q = parseQuestion(soru, NOW, KATEGORILER);
  if (!q) throw new Error(`soru çözümlenemedi: ${soru}`);
  return answerQuestion({ question: q, expenses, incomes });
};

describe("occurrencesInRange", () => {
  it("tek seferlik kayıt yalnızca kendi gününde sayılır", () => {
    const e = gider("2026-10-05", "Market", 100);
    expect(occurrencesInRange(e, "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-05",
    ]);
    expect(occurrencesInRange(e, "2026-10-06", "2026-10-31")).toEqual([]);
  });

  it("tekrarlayan kayıt her ayın aynı gününde sayılır", () => {
    const kira = gider("2026-05-01", "Kira", 18500, "MONTHLY");
    expect(occurrencesInRange(kira, "2026-08-01", "2026-10-31")).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("tekrarlayan kayıt başlangıcından önce sayılmaz", () => {
    const kira = gider("2026-05-01", "Kira", 18500, "MONTHLY");
    expect(occurrencesInRange(kira, "2026-03-01", "2026-04-30")).toEqual([]);
  });

  it("bitiş ayından sonra sayılmaz", () => {
    const kira = gider("2026-05-01", "Kira", 18500, "MONTHLY", "2026-07");
    expect(occurrencesInRange(kira, "2026-05-01", "2026-10-31")).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);
  });

  it("ayda olmayan güne demirlenmişse ayın sonuna kırpılır", () => {
    // 31'inde girilmiş bir kayıt şubatta kaybolmamalı.
    const e = gider("2026-01-31", "Market", 500, "MONTHLY");
    expect(occurrencesInRange(e, "2026-02-01", "2026-02-28")).toEqual([
      "2026-02-28",
    ]);
  });

  it("gün bazlı aralıkta ayın başındaki tekrarı dışarıda bırakır", () => {
    // Asıl mesele: "ayın 13'ünden beri" sorulduğunda ayın 1'indeki kira
    // sayılmamalı. Ayı bütün saymak bu soruya yanlış cevap verirdi.
    const kira = gider("2026-05-01", "Kira", 18500, "MONTHLY");
    expect(occurrencesInRange(kira, "2026-10-13", "2026-10-13")).toEqual([]);
  });
});

describe("ayın 13'ünden beri ne kadar harcadım", () => {
  const harcamalar = [
    gider("2026-05-01", "Kira", 18500, "MONTHLY"), // her ayın 1'i → sayılmaz
    gider("2026-10-10", "Market", 400), // 13'ten önce → sayılmaz
    gider("2026-10-13", "Market", 250), // tam 13'ü → sayılır
    gider("2026-10-13", "Ulaşım", 150), // → sayılır
    gider("2026-11-02", "Market", 900), // gelecek → sayılmaz
  ];

  it("yalnızca aralığa düşenleri toplar", () => {
    const r = cevapla("ayın 13'ünden beri ne kadar harcadım", harcamalar);
    expect(r.total.toString()).toBe("400");
    expect(r.count).toBe(2);
  });

  it("kategori dökümünü büyükten küçüğe verir", () => {
    const r = cevapla("ayın 13'ünden beri ne kadar harcadım", harcamalar);
    expect(r.lines.map((l) => [l.categoryName, l.amount.toString()])).toEqual([
      ["Market", "250"],
      ["Ulaşım", "150"],
    ]);
  });

  it("payları yüzde olarak verir", () => {
    const r = cevapla("ayın 13'ünden beri ne kadar harcadım", harcamalar);
    expect(Math.round(r.lines[0].share)).toBe(63);
  });

  it("aralığı ve gün sayısını taşır", () => {
    const r = cevapla("ayın 13'ünden beri ne kadar harcadım", harcamalar);
    expect(r.from).toBe("2026-10-13");
    expect(r.to).toBe("2026-10-13");
    expect(r.dayCount).toBe(1);
  });
});

describe("aylık aralıkta tekrarlayanlar", () => {
  const harcamalar = [
    gider("2026-05-01", "Kira", 18500, "MONTHLY"),
    gider("2026-10-03", "Market", 2400),
  ];

  it("bu ay sorusunda kirayı bir kez sayar", () => {
    const r = cevapla("bu ay ne kadar harcadım", harcamalar);
    expect(r.total.toString()).toBe("20900");
    expect(r.count).toBe(2);
  });

  it("son 3 ayda kirayı üç kez sayar", () => {
    const r = cevapla("son 3 ayda ne kadar harcadım", harcamalar);
    // 3 × 18.500 kira + 2.400 market
    expect(r.total.toString()).toBe("57900");
  });
});

describe("kategori filtresi", () => {
  const harcamalar = [
    gider("2026-10-03", "Market", 2400),
    gider("2026-10-07", "Market", 1950),
    gider("2026-10-05", "Ulaşım", 1200),
  ];

  it("yalnızca sorulan kategoriyi toplar", () => {
    const r = cevapla("bu ay markete ne kadar harcadım", harcamalar);
    expect(r.categoryQuery).toBe("Market");
    expect(r.total.toString()).toBe("4350");
    expect(r.count).toBe(2);
  });
});

describe("gelir ve net", () => {
  const harcamalar = [gider("2026-10-03", "Market", 2400)];
  const gelirler = [gider("2026-10-01", "Maaş", 30000)];

  it("gelir sorusu gelirleri toplar", () => {
    const r = cevapla("bu ay ne kadar kazandım", harcamalar, gelirler);
    expect(r.metric).toBe("income");
    expect(r.total.toString()).toBe("30000");
  });

  it("net sorusu gelir eksi gider verir", () => {
    const r = cevapla("bu ay net ne kadar kaldı", harcamalar, gelirler);
    expect(r.metric).toBe("net");
    expect(r.total.toString()).toBe("27600");
    // İki taraf da raporda duruyor ki kullanıcı farkı görebilsin.
    expect(r.incomeTotal.toString()).toBe("30000");
    expect(r.expenseTotal.toString()).toBe("2400");
  });
});

describe("boş sonuç", () => {
  it("aralıkta kayıt yoksa sıfır döner, çökmez", () => {
    const r = cevapla("dün ne kadar harcadım", []);
    expect(r.total.toString()).toBe("0");
    expect(r.count).toBe(0);
    expect(r.lines).toEqual([]);
  });
});
