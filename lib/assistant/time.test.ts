import { describe, expect, it } from "vitest";

import { normalize } from "./text";
import { lastCompleteMonths, parseTime, previousPeriod, thisMonth } from "./time";

// 13 Ekim 2026, salı.
const NOW = new Date("2026-10-13T09:00:00Z");

function t(q: string) {
  const r = parseTime(normalize(q), NOW);
  return r ? { from: r.spec.from, to: r.spec.to, phrase: r.spec.phrase, kind: r.spec.kind } : null;
}

describe("parseTime — aylar", () => {
  it.each([
    ["bu ay ne harcadım", "2026-10-01", "2026-10-31", "bu ay"],
    ["bu ayki harcamalarım", "2026-10-01", "2026-10-31", "bu ay"],
    ["geçen ay ne harcadım", "2026-09-01", "2026-09-30", "geçen ay"],
    ["önceki ay", "2026-09-01", "2026-09-30", "geçen ay"],
    // Ay adıyla sorulunca cevap da adıyla söylüyor.
    ["ekimde ne harcadım", "2026-10-01", "2026-10-31", "Ekim'de"],
    ["Ekim'de ne harcadım", "2026-10-01", "2026-10-31", "Ekim'de"],
    ["ekim ayında faturalara ne ödedim", "2026-10-01", "2026-10-31", "Ekim'de"],
    ["eylülde", "2026-09-01", "2026-09-30", "Eylül'de"],
    ["ağustosta", "2026-08-01", "2026-08-31", "Ağustos'ta"],
    ["mart ayı", "2026-03-01", "2026-03-31", "Mart'ta"],
    // Henüz gelmemiş ay: geçen yılınki.
    ["aralıkta ne harcadım", "2025-12-01", "2025-12-31", "Aralık 2025'te"],
    ["kasım 2025", "2025-11-01", "2025-11-30", "Kasım 2025'te"],
    ["geçen yıl ekimde", "2025-10-01", "2025-10-31", "Ekim 2025'te"],
    ["2 ay önce", "2026-08-01", "2026-08-31", "2 ay önce"],
  ])("%s", (q, from, to, phrase) => {
    expect(t(q)).toMatchObject({ from, to, phrase, kind: "month" });
  });
});

describe("parseTime — günler", () => {
  it.each([
    ["bugün ne harcadım", "2026-10-13", "bugün"],
    ["dün ne harcadım", "2026-10-12", "dün"],
    ["dünkü harcamalar", "2026-10-12", "dün"],
    ["önceki gün", "2026-10-11", "önceki gün"],
    ["evvelsi gün", "2026-10-11", "önceki gün"],
    ["3 gün önce", "2026-10-10", "3 gün önce"],
    ["üç gün önce", "2026-10-10", "3 gün önce"],
    ["15 eylülde ne harcadım", "2026-09-15", "15 Eylül'de"],
    ["15 Eylül'de", "2026-09-15", "15 Eylül'de"],
    ["ayın 5'inde", "2026-10-05", "5 Ekim'de"],
    ["5.10.2026", "2026-10-05", "5 Ekim'de"],
    ["05/09", "2026-09-05", "5 Eylül'de"],
    ["geçen cuma", "2026-10-09", "geçen cuma"],
    ["cumartesi", "2026-10-10", "cumartesi günü"],
  ])("%s", (q, gun, phrase) => {
    expect(t(q)).toMatchObject({ from: gun, to: gun, phrase, kind: "day" });
  });

  it("henüz gelmemiş gün geçen yıla düşer", () => {
    expect(t("20 aralıkta")).toMatchObject({ from: "2025-12-20", phrase: "20 Aralık 2025'te" });
  });

  it("'pazar' tek başına gün sayılmaz (semt pazarı olabilir)", () => {
    expect(t("pazara ne harcadım")).toBeNull();
    expect(t("pazar günü ne harcadım")).toMatchObject({ from: "2026-10-11" });
  });
});

describe("parseTime — beri", () => {
  it.each([
    ["ayın 13'ünden beri", "2026-10-13", "13 Ekim'den bu yana"],
    ["ayın 1'inden beri", "2026-10-01", "1 Ekim'den bu yana"],
    ["ayin 5inden beri", "2026-10-05", "5 Ekim'den bu yana"],
    // Ayın 20'si henüz gelmedi → geçen ayın 20'si.
    ["ayın 20'sinden beri", "2026-09-20", "20 Eylül'den bu yana"],
    ["13 eylülden beri", "2026-09-13", "13 Eylül'den bu yana"],
    ["13 Eylül'den bu yana", "2026-09-13", "13 Eylül'den bu yana"],
    ["eylülden beri", "2026-09-01", "1 Eylül'den bu yana"],
    ["ay başından beri", "2026-10-01", "ay başından bu yana"],
    ["yılbaşından beri", "2026-01-01", "yılbaşından bu yana"],
  ])("%s", (q, from, phrase) => {
    expect(t(q)).toMatchObject({ from, to: "2026-10-13", phrase, kind: "since" });
  });
});

describe("parseTime — aralıklar", () => {
  it.each([
    ["1 ekimden 10 ekime kadar ne harcadım", "2026-10-01", "2026-10-10", "1–10 Ekim arasında"],
    ["1 ekim ile 10 ekim arası", "2026-10-01", "2026-10-10", "1–10 Ekim arasında"],
    ["1-10 ekim", "2026-10-01", "2026-10-10", "1–10 Ekim arasında"],
    ["15 eylül - 5 ekim", "2026-09-15", "2026-10-05", "15 Eylül – 5 Ekim arasında"],
    ["15 eylülden 5 ekime kadar", "2026-09-15", "2026-10-05", "15 Eylül – 5 Ekim arasında"],
    ["ayın 1'inden 10'una kadar", "2026-10-01", "2026-10-10", "1–10 Ekim arasında"],
    ["ayın 1'i ile 10'u arası", "2026-10-01", "2026-10-10", "1–10 Ekim arasında"],
  ])("%s", (q, from, to, phrase) => {
    expect(t(q)).toMatchObject({ from, to, phrase, kind: "range" });
  });
});

describe("parseTime — haftalar", () => {
  it("bu hafta pazartesiden pazara", () => {
    expect(t("bu hafta ne harcadım")).toMatchObject({ from: "2026-10-12", to: "2026-10-18", kind: "week" });
  });
  it("geçen hafta", () => {
    expect(t("geçen hafta")).toMatchObject({ from: "2026-10-05", to: "2026-10-11", phrase: "geçen hafta" });
  });
  it("geçen hafta sonu yalnızca cumartesi-pazar", () => {
    expect(t("geçen hafta sonu ne harcadım")).toMatchObject({
      from: "2026-10-10",
      to: "2026-10-11",
      kind: "weekend",
    });
  });
  it("hafta içinde sorulan 'hafta sonu' son hafta sonu", () => {
    expect(t("hafta sonu ne harcadım")).toMatchObject({ from: "2026-10-10", to: "2026-10-11" });
  });
});

describe("parseTime — son N", () => {
  it.each([
    ["son 30 günde", "2026-09-14", "2026-10-13", "son 30 günde"],
    ["son 7 gün", "2026-10-07", "2026-10-13", "son 7 günde"],
    ["son yedi gün", "2026-10-07", "2026-10-13", "son 7 günde"],
    ["son 2 hafta", "2026-09-30", "2026-10-13", "son 2 haftada"],
    ["son 3 ay", "2026-08-01", "2026-10-31", "son 3 ayda"],
    ["son üç ayda", "2026-08-01", "2026-10-31", "son 3 ayda"],
  ])("%s", (q, from, to, phrase) => {
    expect(t(q)).toMatchObject({ from, to, phrase, kind: "lastN" });
  });
});

describe("parseTime — yıllar ve tüm zamanlar", () => {
  it("bu yıl içinde bulunulan ayın sonunda biter", () => {
    expect(t("bu yıl toplam ne harcadım")).toMatchObject({ from: "2026-01-01", to: "2026-10-31", phrase: "bu yıl" });
  });
  it("geçen yıl", () => {
    expect(t("geçen sene")).toMatchObject({ from: "2025-01-01", to: "2025-12-31", phrase: "geçen yıl" });
  });
  it("2024 yılında", () => {
    expect(t("2024 yılında ne harcadım")).toMatchObject({ from: "2024-01-01", to: "2024-12-31", phrase: "2024 yılında" });
  });
  it.each(["şimdiye kadar toplam ne harcadım", "tüm zamanlarda", "toplamda ne kadar"])("%s", (q) => {
    expect(t(q)).toMatchObject({ kind: "all" });
  });
});

describe("parseTime — rest", () => {
  it("zaman ifadesini metinden çıkarır", () => {
    expect(parseTime(normalize("ekim ayında faturalara ne ödedim"), NOW)?.rest).toBe("faturalara ne odedim");
    expect(parseTime(normalize("geçen hafta sonu markete"), NOW)?.rest).toBe("markete");
  });
  it("zaman yoksa null", () => {
    expect(parseTime(normalize("markete ne kadar harcadım"), NOW)).toBeNull();
    expect(parseTime(normalize("en çok neye para harcadım"), NOW)).toBeNull();
    expect(parseTime(normalize("kira ne kadar"), NOW)).toBeNull();
    expect(parseTime(normalize("kaç kere markete gittim"), NOW)).toBeNull();
  });
});

describe("yardımcı aralıklar", () => {
  it("thisMonth", () => {
    expect(thisMonth(NOW)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("lastCompleteMonths içinde bulunulan ayı dışarıda bırakır", () => {
    expect(lastCompleteMonths(3, NOW)).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
  });
  it("previousPeriod: ay → önceki ay", () => {
    const ekim = parseTime("bu ay", NOW)!.spec;
    expect(previousPeriod(ekim, NOW)).toMatchObject({ from: "2026-09-01", to: "2026-09-30", phrase: "geçen ay" });
  });
  it("previousPeriod: son 30 gün → önceki 30 gün", () => {
    const son30 = parseTime("son 30 gun", NOW)!.spec;
    expect(previousPeriod(son30, NOW)).toMatchObject({ from: "2026-08-15", to: "2026-09-13" });
  });
});
