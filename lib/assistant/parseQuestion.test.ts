import { describe, expect, it } from "vitest";

import { parseQuestion } from "./parseQuestion";

// Sabit "bugün": 13 Ekim 2026, salı.
const NOW = new Date("2026-10-13T09:00:00Z");
const KATEGORILER = ["Kira", "Market", "Ulaşım", "Yeme-İçme"];

const soz = (s: string) => parseQuestion(s, NOW, KATEGORILER);

describe("zaman ifadeleri", () => {
  it("ayın 13'ünden beri", () => {
    const r = soz("ayın 13'ünden beri ne kadar harcadım?");
    expect(r).toMatchObject({ from: "2026-10-13", to: "2026-10-13" });
    expect(r?.rangeLabel).toBe("ayın 13'inden bugüne");
  });

  it("kesme işareti olmadan da anlar", () => {
    expect(soz("ayın 5 inden beri ne harcadım")).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-13",
    });
  });

  it("ayda olmayan günü ayın sonuna kırpar", () => {
    // 10 Mart'ta "ayın 31'inden beri": 31 henüz gelmedi, geçen ay şubat ve
    // şubatın 31'i yok — ayın son gününe kırpılır.
    expect(
      parseQuestion(
        "ayın 31'inden beri harcamalarım",
        new Date("2026-03-10T00:00:00Z")
      )
    ).toMatchObject({ from: "2026-02-28" });

    // Gün bu ay içinde zaten geçmişse bu ayın kendisi kullanılır.
    expect(
      parseQuestion(
        "ayın 31'inden beri harcamalarım",
        new Date("2026-10-31T00:00:00Z")
      )
    ).toMatchObject({ from: "2026-10-31" });
  });

  it("13 ekimden beri", () => {
    expect(soz("13 ekimden beri ne kadar harcadım")).toMatchObject({
      from: "2026-10-13",
      to: "2026-10-13",
    });
  });

  it("gelecekte kalan gün-ay geçen yıla düşer", () => {
    // 20 Aralık henüz gelmedi; kastedilen geçen yılın aralığı.
    expect(soz("20 aralıktan beri ne harcadım")).toMatchObject({
      from: "2025-12-20",
    });
  });

  it("bugün ve dün", () => {
    expect(soz("bugün ne kadar harcadım")).toMatchObject({
      from: "2026-10-13",
      to: "2026-10-13",
    });
    expect(soz("dün ne kadar harcadım")).toMatchObject({
      from: "2026-10-12",
      to: "2026-10-12",
    });
  });

  it("bu hafta pazartesiden başlar", () => {
    // 13 Ekim 2026 salı; haftanın pazartesisi 12 Ekim.
    expect(soz("bu hafta ne kadar harcadım")).toMatchObject({
      from: "2026-10-12",
      to: "2026-10-13",
    });
  });

  it("geçen hafta tam bir pazartesi–pazar", () => {
    expect(soz("geçen hafta ne kadar harcadım")).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-11",
    });
  });

  it("bu ay ve geçen ay", () => {
    expect(soz("bu ay ne kadar harcadım")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(soz("geçen ay ne kadar harcadım")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("son N gün / hafta / ay", () => {
    expect(soz("son 7 gün ne kadar harcadım")).toMatchObject({
      from: "2026-10-07",
      to: "2026-10-13",
    });
    expect(soz("son 2 hafta ne kadar harcadım")).toMatchObject({
      from: "2026-09-30",
    });
    // "Son 3 ay" içinde bulunulan ay dahil: ağustos, eylül, ekim.
    expect(soz("son 3 ayda ne kadar harcadım")).toMatchObject({
      from: "2026-08-01",
      to: "2026-10-31",
    });
  });

  it("bu yıl ve geçen yıl", () => {
    expect(soz("bu yıl ne kadar harcadım")).toMatchObject({
      from: "2026-01-01",
      to: "2026-10-31",
    });
    expect(soz("geçen yıl ne kadar harcadım")).toMatchObject({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("yılbaşından beri", () => {
    expect(soz("yılbaşından beri ne kadar harcadım")).toMatchObject({
      from: "2026-01-01",
    });
  });

  it("ay adı: yazılmamış yıl en yakın geçmişe düşer", () => {
    // Ekimdeyiz: "ağustosta" bu yılın ağustosu.
    expect(soz("ağustosta ne kadar harcadım")).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    // "Aralıkta" henüz gelmedi: geçen yılın aralığı.
    expect(soz("aralıkta ne kadar harcadım")).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("ay adı + yıl", () => {
    expect(soz("mart 2025 te ne kadar harcadım")).toMatchObject({
      from: "2025-03-01",
      to: "2025-03-31",
    });
  });
});

describe("ölçü", () => {
  it("harcama sözcüklerini gider sayar", () => {
    for (const s of [
      "bu ay ne kadar harcadım",
      "bu ay giderim ne kadar",
      "bu ay ne kadar ödeme yaptım",
      "bu ay masrafım ne",
    ]) {
      expect(soz(s)?.metric, s).toBe("expense");
    }
  });

  it("gelir sözcüklerini gelir sayar", () => {
    expect(soz("bu ay ne kadar kazandım")?.metric).toBe("income");
    expect(soz("bu ay gelirim ne kadar")?.metric).toBe("income");
  });

  it("net sorusunu net sayar", () => {
    expect(soz("bu ay net ne kadar kaldı")?.metric).toBe("net");
    expect(soz("bu ay ne kadar birikti")?.metric).toBe("net");
  });

  it("gelir ve gider birlikte geçerse gideri seçer", () => {
    // "Gelirime göre ne kadar harcadım" — sorulan şey harcama.
    expect(soz("bu ay gelirime göre ne kadar harcadım")?.metric).toBe("expense");
  });
});

describe("kategori ve en çok", () => {
  it("kategori adını yakalar", () => {
    expect(soz("bu ay markete ne kadar harcadım")?.categoryQuery).toBe("Market");
    expect(soz("geçen ay kiraya ne verdim harcadım")?.categoryQuery).toBe("Kira");
  });

  it("kategori yoksa null", () => {
    expect(soz("bu ay ne kadar harcadım")?.categoryQuery).toBeNull();
  });

  it("'en çok nereye' işaretlenir", () => {
    expect(soz("bu ay en çok nereye harcadım")?.wantsTop).toBe(true);
    expect(soz("bu ay ne kadar harcadım")?.wantsTop).toBe(false);
  });
});

describe("anlaşılmayan sorular", () => {
  it("zaman yoksa null", () => {
    // Tahmin etmek yerine açıkça anlamamak: yanlış aralıkla emin bir rakam
    // vermek, kullanıcının kontrol etmeyeceği bir hata olurdu.
    expect(soz("ne kadar harcadım")).toBeNull();
  });

  it("ölçü yoksa null", () => {
    expect(soz("bu ay nasıl geçti")).toBeNull();
  });

  it("boş soru null", () => {
    expect(soz("   ")).toBeNull();
  });

  it("alakasız soru null", () => {
    expect(soz("hava nasıl olacak")).toBeNull();
  });
});

describe("yazım esnekliği", () => {
  it("büyük harf ve noktalama fark etmez", () => {
    expect(soz("BU AY NE KADAR HARCADIM?!")).toMatchObject({
      metric: "expense",
      from: "2026-10-01",
    });
  });

  it("şapkasız/eksik harflerle de çalışır", () => {
    expect(soz("gecen ay ne kadar harcadim")).toMatchObject({
      from: "2026-09-01",
    });
  });
});

describe("henüz gelmemiş gün", () => {
  // Ayın 11'indeyiz ve "ayın 13'ünden beri" soruluyor.
  const ONBIRI = new Date("2026-10-11T09:00:00Z");

  it("geçen ayın aynı gününe düşer", () => {
    expect(parseQuestion("ayın 13'ünden beri ne harcadım", ONBIRI)).toMatchObject(
      { from: "2026-09-13", to: "2026-10-11" }
    );
  });

  it("aralık asla ters dönmez", () => {
    // Her gün için: başlangıç bitişten sonra olamaz. Ters aralık sessizce
    // her zaman boş sonuç veriyordu.
    for (let gun = 1; gun <= 31; gun++) {
      const r = parseQuestion(`ayın ${gun}'inden beri ne harcadım`, ONBIRI);
      expect(r, `ayın ${gun}'i`).not.toBeNull();
      expect(r!.from <= r!.to, `ayın ${gun}'i: ${r!.from} → ${r!.to}`).toBe(true);
    }
  });

  it("ocakta geçen yılın aralığına taşar", () => {
    expect(
      parseQuestion("ayın 20'sinden beri ne harcadım", new Date("2026-01-05T00:00:00Z"))
    ).toMatchObject({ from: "2025-12-20", to: "2026-01-05" });
  });
});
