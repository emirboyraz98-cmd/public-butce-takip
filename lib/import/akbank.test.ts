import { describe, expect, it } from "vitest";

import {
  parseAkbankAmount,
  parseAkbankEmail,
  suggestCategory,
} from "./akbank";

/**
 * Gövdelerin KALIBI gerçek Akbank maillerinden alındı — uydurma örnekle
 * test etmek yalnızca kendi regex'imizi doğrulardı. Ama isim, kartın son
 * dört hanesi, tutarlar ve kalan limit sentetik: bunlar kişisel finansal
 * veri ve depo çatallanınca (fork) karşı tarafa aynen geçerdi.
 */
const BODY_INSTALLMENT =
  " AKBANK\n\n| Bu mail'i görüntüleyemiyorsanız lütfen tıklayınız. [](http://haberci.akbank.com/x) |\n\n| |\n| # Değerli Akbanklı, 4321 ile biten AHMET YILMAZ adına ait Axess Asıl kartınızla 3 ay vadeli 1,234.56 TL tutarında KREDI KARTI harcaması yapılmıştır. 987,654.32 TL limitiniz kalmıştır. Kredi kartı harcamalarınızı görmek için Akbank Mobil[](http://haberci.akbank.com/y)'e giriş yapabilirsiniz. |\n| Saygılarımızla, Akbank |";

const BODY_CONTACTLESS =
  "| # Değerli Akbanklı, 4321 ile biten AHMET YILMAZ adına ait Axess Asıl, 87.50 TL tutarında GIDA VE MARKET harcaması temassız olarak yapılmıştır. 912,345.67 TL limitiniz kalmıştır. |";

const BODY_VIRTUAL_CARD =
  "| # Değerli Akbanklı, 8765 ile biten AHMET YILMAZ adına ait Axess Sanal kartınızla 2,500.00 TL tutarında KREDI KARTI harcaması yapılmıştır. 905,000.00 TL limitiniz kalmıştır. |";

const BODY_FOREIGN_EUR =
  "| # Değerli Akbanklı, 4321 ile biten AHMET YILMAZ adına ait Axess Asıl kartınızla 120.00 EUR tutarında KREDI KARTI harcaması yapılmıştır. 900,111.22 TL limitiniz kalmıştır. |";

const BODY_FOREIGN_MAD =
  "| # Değerli Akbanklı, 4321 ile biten AHMET YILMAZ adına ait Axess Asıl, 340.00 MAD tutarında YEMEK harcaması temassız olarak yapılmıştır. 899,000.10 TL limitiniz kalmıştır. |";

const BODY_COMMA_SECTOR =
  "| # Değerli Akbanklı, 4321 ile biten AHMET YILMAZ adına ait Axess Asıl kartınızla 2 ay vadeli 1,080.70 TL tutarında OYUNCAK ,OYUN harcaması yapılmıştır. 870,500.00 TL limitiniz kalmıştır. |";

const BODY_CANCELLED =
  "| # Değerli Akbanklı, 4321 ile biten AHMET YILMAZ adına ait Axess Asıl kartınızla yapılan 3,000.00 TL kartınızla tutarındaki SPOR MALZEMESI harcamanız iptal edilmiştir. |";

const BODY_UNRELATED =
  "| # Değerli Akbanklı, 3****3 no.lu hesabınıza MAAŞ ÖDEMESİ açıklamasıyla ödeme yapılmıştır. |";

function parse(body: string, subject = "Kredi kartı harcamanız") {
  const result = parseAkbankEmail({ subject, body });
  if (!result.ok) throw new Error(`Ayrıştırılamadı: ${result.reason}`);
  return result.transaction;
}

describe("parseAkbankAmount", () => {
  it("İngilizce biçimi okur", () => {
    expect(parseAkbankAmount("1,234.56")).toBe("1234.56");
    expect(parseAkbankAmount("987,654.32")).toBe("987654.32");
    expect(parseAkbankAmount("230.00")).toBe("230.00");
  });

  it("Türkçe biçimi de okur — banka bir gün değiştirirse tutar 1000 kat şaşmasın", () => {
    expect(parseAkbankAmount("1.234,56")).toBe("1234.56");
    expect(parseAkbankAmount("987.654,32")).toBe("987654.32");
  });

  it("tek ayraç + 3 hane binliktir, 2 hane ondalıktır", () => {
    expect(parseAkbankAmount("1,900")).toBe("1900");
    expect(parseAkbankAmount("1.900")).toBe("1900");
    expect(parseAkbankAmount("87.50")).toBe("87.50");
  });

  it("ayraçsız tam sayıyı bozmaz", () => {
    expect(parseAkbankAmount("450")).toBe("450");
  });

  it("sayı olmayanı reddeder", () => {
    expect(parseAkbankAmount("TL")).toBeNull();
    expect(parseAkbankAmount("")).toBeNull();
  });
});

describe("parseAkbankEmail", () => {
  it("taksitli harcamayı tüm alanlarıyla okur", () => {
    expect(parse(BODY_INSTALLMENT)).toEqual({
      kind: "PURCHASE",
      cardLast4: "4321",
      cardName: "Axess Asıl",
      cardHolder: "AHMET YILMAZ",
      amount: "1234.56",
      currency: "TRY",
      sector: "KREDI KARTI",
      installmentCount: 3,
      contactless: false,
      abroad: false,
      remainingLimit: "987654.32",
    });
  });

  it("temassız kalıbında kart adı virgülle biter, tutar yine doğru okunur", () => {
    const t = parse(BODY_CONTACTLESS);
    expect(t.cardName).toBe("Axess Asıl");
    expect(t.amount).toBe("87.50");
    expect(t.sector).toBe("GIDA VE MARKET");
    expect(t.contactless).toBe(true);
    expect(t.installmentCount).toBe(1);
  });

  it("kartları son dört haneyle ayırır", () => {
    expect(parse(BODY_VIRTUAL_CARD).cardLast4).toBe("8765");
    expect(parse(BODY_VIRTUAL_CARD).cardName).toBe("Axess Sanal");
  });

  it("yurt dışı harcamasında yabancı para birimini olduğu gibi bırakır", () => {
    const t = parse(BODY_FOREIGN_EUR, "Yurt Dışı Kredi kartı harcamanız");
    expect(t.currency).toBe("EUR");
    expect(t.amount).toBe("120.00");
    expect(t.abroad).toBe(true);
    // Mail TL karşılığını YAZMIYOR; kalan limit harcamanın tutarı değil.
    expect(t.remainingLimit).toBe("900111.22");
  });

  it("üç harfli egzotik para birimini de okur", () => {
    const t = parse(BODY_FOREIGN_MAD, "Yurt Dışı Kredi kartı harcamanız");
    expect(t.currency).toBe("MAD");
    expect(t.sector).toBe("YEMEK");
  });

  it("içinde virgül geçen sektör adını bölmez", () => {
    const t = parse(BODY_COMMA_SECTOR);
    expect(t.sector).toBe("OYUNCAK,OYUN");
    expect(t.installmentCount).toBe(2);
    expect(t.amount).toBe("1080.70");
  });

  it("iptal mailini harcamadan ayırır", () => {
    const t = parse(BODY_CANCELLED, "Kredi kartı harcamanız iptal olmuştur");
    expect(t.kind).toBe("CANCELLATION");
    expect(t.amount).toBe("3000.00");
    expect(t.sector).toBe("SPOR MALZEMESI");
    expect(t.cardLast4).toBe("4321");
  });

  it("iptal maili yanlışlıkla harcama sayılmaz", () => {
    // Kalıplar benziyor; ayrışmazsa iptal edilen tutar gider olarak yazılırdı.
    const t = parse(BODY_CANCELLED, "Kredi kartı harcamanız iptal olmuştur");
    expect(t.kind).not.toBe("PURCHASE");
  });

  it("kart harcaması olmayan maili reddeder", () => {
    const result = parseAkbankEmail({
      subject: "Maaş ödemeniz gerçekleşmiştir",
      body: BODY_UNRELATED,
    });
    expect(result.ok).toBe(false);
  });

  it("Akbank dışı göndereni reddeder", () => {
    const result = parseAkbankEmail({
      subject: "Kredi kartı harcamanız",
      body: BODY_INSTALLMENT,
      from: "phish@example.com",
    });
    expect(result).toEqual({ ok: false, reason: "Gönderen Akbank değil" });
  });

  it("gerçek gönderene izin verir", () => {
    const result = parseAkbankEmail({
      subject: "Kredi kartı harcamanız",
      body: BODY_INSTALLMENT,
      from: "HIZMET@bilgi.akbank.com",
    });
    expect(result.ok).toBe(true);
  });
});

describe("suggestCategory", () => {
  it("bilinen sektörleri eşler", () => {
    expect(suggestCategory("YEMEK")).toBe("Yeme-İçme");
    expect(suggestCategory("GIDA VE MARKET")).toBe("Market");
    expect(suggestCategory("BENZIN ISTASYONU")).toBe("Akaryakıt");
    expect(suggestCategory("KAMU")).toBe("Vergi/Resmî Ödeme");
  });

  it("bankanın genel kovası olan KREDI KARTI kategori uydurmaz", () => {
    expect(suggestCategory("KREDI KARTI")).toBe("Diğer");
  });

  it("tanımadığı sektörü Diğer'e düşürür", () => {
    expect(suggestCategory("BILINMEYEN SEKTOR")).toBe("Diğer");
  });

  /**
   * Tablodaki anahtarları tek başına test etmek yetmiyor: eşleme, mailden
   * ÇIKAN sektöre uygulanıyor ve ayrıştırıcı sektörü normalize ediyor.
   * "OYUNCAK ,OYUN" anahtarı tabloda boşluklu durduğu için hiç eşleşmiyordu
   * — iki parçayı ayrı test etmek bu boşluğu görmemişti.
   */
  it("ayrıştırıcının ÜRETTİĞİ sektör tabloyla eşleşiyor", () => {
    const cases: [string, string][] = [
      [BODY_COMMA_SECTOR, "Eğlence"],
      [BODY_CONTACTLESS, "Market"],
      [BODY_FOREIGN_MAD, "Yeme-İçme"],
    ];
    for (const [body, expected] of cases) {
      const result = parseAkbankEmail({ subject: "Kredi kartı harcamanız", body });
      if (!result.ok) throw new Error(result.reason);
      expect(suggestCategory(result.transaction.sector)).toBe(expected);
    }
  });
});
