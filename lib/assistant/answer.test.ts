import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/defaults";

import { answerQuestion, occurrencesInRange, type Answer, type Budget, type Movement } from "./answer";
import { parseQuestion } from "./parseQuestion";

// 13 Ekim 2026, salı.
const NOW = new Date("2026-10-13T09:00:00Z");
const VOCAB = {
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  incomeCategories: [...DEFAULT_INCOME_CATEGORIES, "Maaş"],
  loans: ["Konut Kredisi"],
};

type Girdi = Omit<Partial<Movement>, "amount"> & Pick<Movement, "date" | "categoryName"> & { amount: number };
const gider = (g: Girdi): Movement => ({
  direction: "out",
  note: null,
  source: "cash",
  frequency: "ONE_TIME",
  ...g,
  amount: new Decimal(g.amount),
});
const gelir = (g: Girdi): Movement => ({
  direction: "in",
  note: null,
  source: "income",
  frequency: "ONE_TIME",
  ...g,
  amount: new Decimal(g.amount),
});

const HAREKETLER: Movement[] = [
  gider({ date: "2026-01-01", categoryName: "Kira", amount: 15000, frequency: "MONTHLY", note: "Ev kirası" }),
  gider({ date: "2026-10-02", categoryName: "Market", amount: 1200, note: "Migros" }),
  gider({ date: "2026-10-08", categoryName: "Market", amount: 850, note: "A101" }),
  gider({ date: "2026-10-12", categoryName: "Market", amount: 400, note: "Bakkal" }),
  gider({ date: "2026-09-05", categoryName: "Market", amount: 1500, note: "Migros" }),
  gider({ date: "2026-09-20", categoryName: "Market", amount: 900 }),
  gider({ date: "2026-08-15", categoryName: "Market", amount: 1300 }),
  gider({ date: "2026-10-05", categoryName: "Yeme-İçme", amount: 650, note: "Burger" }),
  gider({ date: "2026-10-10", categoryName: "Yeme-İçme", amount: 1200, note: "Akşam yemeği" }),
  gider({ date: "2026-09-10", categoryName: "Yeme-İçme", amount: 2000 }),
  gider({ date: "2026-08-03", categoryName: "Yeme-İçme", amount: 1800 }),
  gider({ date: "2026-10-11", categoryName: "Ulaşım", amount: 300, source: "card", note: "Taksi" }),
  gider({ date: "2026-09-01", categoryName: "Ulaşım", amount: 1500, note: "İstanbulkart" }),
  gider({ date: "2026-09-12", categoryName: "Eğlence", amount: 1800, source: "card", note: "Konser bileti - Duman" }),
  gider({ date: "2026-10-10", categoryName: "Eğlence", amount: 500, note: "Sinema" }),
  gider({ date: "2026-03-15", categoryName: "Faturalar", amount: 1200, frequency: "MONTHLY", note: "Elektrik" }),
  gider({ date: "2026-10-20", categoryName: "Faturalar", amount: 800, note: "Doğalgaz" }),
  gider({ date: "2026-10-06", categoryName: "Elektronik", amount: 18000, source: "card", note: "Kulaklık" }),
  gider({ date: "2026-02-10", categoryName: "Abonelikler", amount: 230, source: "card", frequency: "MONTHLY", note: "Netflix" }),
  gider({ date: "2026-10-09", categoryName: "Akaryakıt", amount: 2500, source: "card" }),
  gelir({ date: "2026-10-07", categoryName: "Freelance", amount: 5000, note: "Logo işi" }),
  gelir({ date: "2026-10-01", categoryName: "Maaş", amount: 80000, source: "salary", accrualMonth: "2026-09" }),
  gelir({ date: "2026-09-01", categoryName: "Maaş", amount: 78000, source: "salary", accrualMonth: "2026-08" }),
  gelir({ date: "2026-08-01", categoryName: "Maaş", amount: 76000, source: "salary", accrualMonth: "2026-07" }),
  gelir({ date: "2026-11-01", categoryName: "Maaş", amount: 82000, source: "salary", accrualMonth: "2026-10" }),
  ...Array.from({ length: 12 }, (_, i) =>
    gider({ date: `2026-${String(i + 1).padStart(2, "0")}-01`, categoryName: "Konut Kredisi", amount: 12000, source: "loan" })
  ),
];

const BUTCELER: Budget[] = [
  { categoryName: "Market", limit: new Decimal(3000) },
  { categoryName: "Eğlence", limit: new Decimal(1000) },
  { categoryName: "Yeme-İçme", limit: new Decimal(1500) },
  { categoryName: "Kira", limit: null },
];

function sor(q: string, movements = HAREKETLER, budgets = BUTCELER): Answer {
  const question = parseQuestion(q, NOW, VOCAB);
  if (!question) throw new Error(`çözümlenemedi: ${q}`);
  return answerQuestion({
    question,
    movements,
    budgets,
    cardLimit: new Decimal(20000),
    currency: "TRY",
    now: NOW,
  });
}

const metin = (a: Answer) => a.parts.map((p) => p.t).join("");
const vurgu = (a: Answer) => a.parts.filter((p) => p.b).map((p) => p.t);

describe("occurrencesInRange", () => {
  it("aylık kayıt ayın aynı gününe demirlenir", () => {
    const kira = HAREKETLER[0];
    expect(occurrencesInRange(kira, "2026-10-01", "2026-10-31")).toEqual(["2026-10-01"]);
    expect(occurrencesInRange(kira, "2026-10-13", "2026-10-31")).toEqual([]);
  });

  it("ayda olmayan gün ayın son gününe kırpılır", () => {
    const m = gider({ date: "2026-01-31", categoryName: "Kira", amount: 1, frequency: "MONTHLY" });
    expect(occurrencesInRange(m, "2026-02-01", "2026-02-28")).toEqual(["2026-02-28"]);
  });

  it("bitiş ayından sonra tekrar etmez", () => {
    const m = gider({ date: "2026-01-01", categoryName: "Kira", amount: 1, frequency: "MONTHLY", recurrenceEndMonth: "2026-03" });
    expect(occurrencesInRange(m, "2026-01-01", "2026-12-31")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

/*
 * İlke: yalnızca sorulana cevap. "Markete ne kadar harcadım" tek cümle;
 * kategori dökümü, günlük ortalama, gelir sorulmadıkça yok.
 */
describe("yalnızca sorulana cevap", () => {
  it("toplam sorusu tek cümle, liste yok", () => {
    const a = sor("markete ne kadar harcadım");
    expect(metin(a)).toBe("Bu ay Market için 2.450 TRY harcadın.");
    expect(a.rows).toEqual([]);
    expect(a.context).toContain("Zaman belirtmediğin için bu ayı aldım.");
  });

  it("kredi taksitleri sorulmadıkça harcamaya girmez", () => {
    expect(vurgu(sor("bu ay ne kadar harcadım"))).toEqual(["42.830 TRY"]);
    expect(metin(sor("bu ay krediye ne kadar ödedim"))).toBe("Bu ay kredi taksitlerine 12.000 TRY ödedin.");
  });

  it("'ne harcadım' kısa aralıkta kalemleri verir", () => {
    const a = sor("dün ne harcadım");
    expect(metin(a)).toBe("Dün 400 TRY harcadın.");
    expect(a.rows).toEqual([{ label: "Bakkal", detail: "12 Eki · Market", amount: "400 TRY" }]);
  });

  it("'ne harcadım' uzun aralıkta kategori dökümü verir", () => {
    const a = sor("son 30 günde ne harcadım");
    expect(a.rows[0]).toMatchObject({ label: "Elektronik", amount: "18.000 TRY" });
  });
});

describe("kart harcaması ve ekstre ayı", () => {
  it("ekstresi sonraki aya düşen kart harcaması için not düşer", () => {
    const kart = gider({ date: "2026-10-08", categoryName: "Market", amount: 1250, source: "card", paymentMonth: "2026-11" });
    const a = sor("bu ay ne kadar harcadım", [kart]);
    expect(metin(a)).toBe("Bu ay 1.250 TRY harcadın.");
    expect(a.context.join(" ")).toContain("ekstrenin ödendiği aya");
    // Ekstresi aynı aya düşüyorsa not yok.
    const ayni = gider({ ...kart, amount: 1250, paymentMonth: "2026-10" });
    expect(sor("bu ay ne kadar harcadım", [ayni]).context.join(" ")).not.toContain("ekstre");
  });
});

describe("soru tipleri", () => {
  it("en çok", () => {
    expect(metin(sor("en çok neye para harcadım"))).toBe(
      "Bu ay en çok Elektronik için harcadın: 18.000 TRY (giderlerinin %42'si)."
    );
    expect(metin(sor("geçen ay en az neye harcadım"))).toBe(
      "Geçen ay en az Abonelikler için harcadın: 230 TRY (giderlerinin %1'i)."
    );
  });

  it("en büyük harcama", () => {
    expect(metin(sor("en büyük harcamam ne"))).toBe(
      "Bu ay en büyük harcaman 6 Ekim'de Elektronik için 18.000 TRY — “Kulaklık”."
    );
  });

  it("en son harcama", () => {
    expect(metin(sor("en son ne harcadım"))).toBe("En son 12 Ekim'de Market için 400 TRY harcadın — “Bakkal”.");
    expect(metin(sor("en son markete ne zaman gittim"))).toBe("Market için en son 12 Ekim'de 400 TRY harcadın — “Bakkal”.");
  });

  it("son harcamalar listesi", () => {
    const a = sor("son harcamalarım neler");
    expect(metin(a)).toBe("Son 5 harcaman:");
    expect(a.rows.map((r) => r.label)).toEqual(["Bakkal", "Taksi", "Akşam yemeği", "Sinema", "Netflix"]);
  });

  it("sayı", () => {
    expect(metin(sor("kaç kere markete gittim"))).toBe("Bu ay Market için 3 kez harcama yaptın.");
  });

  it("günlük ortalama bugüne kadarki günlere bölünür", () => {
    expect(metin(sor("günlük ortalama ne kadar harcıyorum"))).toBe(
      "Bu ay günlük ortalama harcaman 3.141 TRY (13 günde toplam 40.830 TRY)."
    );
  });

  it("aylık ortalama son 3 tam ay", () => {
    expect(metin(sor("eğlenceye ayda ortalama ne harcıyorum"))).toBe(
      "Son 3 tam ayda Eğlence için aylık ortalama harcaman 600 TRY (3 ayda toplam 1.800 TRY)."
    );
  });

  it("alışkanlık sorusu ortalama ve bu ayı verir", () => {
    expect(metin(sor("yemeğe ne kadar gidiyor"))).toBe(
      "Son 3 tam ayda Yeme-İçme için aylık ortalama harcaman 1.267 TRY (3 ayda toplam 3.800 TRY). Bu ay şimdiye kadar 1.850 TRY."
    );
  });

  it("karşılaştırma süren ayı geçen ayın aynı günleriyle kıyaslar", () => {
    expect(metin(sor("geçen aya göre daha mı çok harcadım"))).toBe(
      "Bu ay şimdiye kadar 40.830 TRY harcadın; geçen ayın aynı günlerinde (1–13 Eylül 2026) 22.030 TRY harcamıştın. " +
        "Harcaman %85 daha fazla. Geçen ayın tamamı: 24.130 TRY."
    );
  });

  it("karşılaştırma tabanı kayıtlardan önceyse kıyaslamaz", () => {
    expect(metin(sor("geçen yıla göre bu yıl daha çok mu harcadım"))).toContain("kıyaslayamıyorum");
  });

  it("en çok harcanan ay", () => {
    expect(metin(sor("hangi ay en çok harcadım"))).toBe("Son 12 ayda en çok Ekim'de harcadın: 40.830 TRY.");
  });

  it("gelir birden çok kaynaktansa kaynakları da söyler", () => {
    expect(metin(sor("bu ay ne kadar kazandım"))).toBe(
      "Bu ay 85.000 TRY gelirin oldu (Maaş 80.000 TRY, Freelance 5.000 TRY)."
    );
  });

  it("birikim: kredi taksitleri gidere dahil", () => {
    const a = sor("bu ay kaç para biriktirdim");
    expect(metin(a)).toBe("Bu ay 30.170 TRY biriktirdin. Gelir 85.000 TRY, gider 54.830 TRY.");
    expect(a.context).toContain("Kredi taksitleri gidere dahil.");
  });

  it("tasarruf oranı", () => {
    expect(metin(sor("tasarruf oranım ne"))).toBe("Bu ay gelirinin %35'ini biriktirdin: 85.000 TRY gelirden 30.170 TRY.");
  });

  it("pay", () => {
    expect(metin(sor("market yüzde kaç"))).toBe("Bu ay harcamalarının %6'sı Market için: 2.450 TRY / 42.830 TRY.");
    expect(metin(sor("bu ay gelirimin ne kadarını harcadım"))).toBe(
      "Bu ay gelirinin %65'ini harcadın: 85.000 TRY gelirden 54.830 TRY."
    );
  });

  it("maaş: son yatan ve belirli ayın hak edişi", () => {
    expect(metin(sor("maaşım ne kadar"))).toBe("Son maaşın 80.000 TRY (Eylül maaşı, Ekim'de yattı).");
    expect(metin(sor("ekim maaşım ne kadar"))).toBe("Ekim maaşın 82.000 TRY (Kasım'da yatacak).");
  });

  it("maaş hesaplanmamışsa 'maaş' notlu gelir kaydını bulur", () => {
    const hareketler = [gelir({ date: "2026-10-05", categoryName: "Diğer", amount: 42000, note: "maaş" })];
    expect(metin(sor("maaşım ne kadar", hareketler))).toBe("Son maaşın 42.000 TRY — 5 Ekim'de girdiğin gelir kaydı.");
  });

  it("ortalama boşsa sıfır demek yerine kayıt olmadığını ve bu ayı söyler", () => {
    const hareketler = [gider({ date: "2026-10-09", categoryName: "Eğlence", amount: 2200 })];
    expect(metin(sor("eğlenceye ayda ortalama ne harcıyorum", hareketler))).toBe(
      "Son 3 tam ayda Eğlence için harcama kaydın yok. Bu ay şimdiye kadar 2.200 TRY."
    );
  });

  it("tutar eşiği kalemleri listeler", () => {
    const a = sor("bu ay 2000 tl üstü harcama");
    expect(metin(a)).toBe("Bu ay 2.000 TRY üstünde 3 harcaman var, toplam 35.500 TRY.");
    expect(a.rows).toHaveLength(3);
  });
});

describe("bütçe", () => {
  it("aşan kategoriler", () => {
    const a = sor("bütçemi aştım mı");
    expect(metin(a)).toBe("Bu ay 1 kategoride bütçeyi aştın: Yeme-İçme.");
    expect(a.rows).toEqual([{ label: "Yeme-İçme", detail: "1.850 TRY / 1.500 TRY", amount: "+350 TRY" }]);
  });

  it("kategorinin kalanı", () => {
    expect(metin(sor("market bütçemden ne kadar kaldı"))).toBe(
      "Bu ay Market bütçenden 550 TRY kaldı; 3.000 TRY sınırın %82'si harcandı."
    );
  });

  it("evet/hayır sorusu cevapla başlar", () => {
    expect(metin(sor("markette bütçeyi aştım mı"))).toMatch(/^Hayır\. /);
    expect(metin(sor("kart limitimi aştım mı"))).toMatch(/^Evet\. Bu ay kart sınırın 1\.030 TRY aşıldı/);
  });

  it("sınır yoksa söyler", () => {
    expect(metin(sor("bütçemi aştım mı", HAREKETLER, []))).toBe("Henüz hiçbir kategoriye bütçe sınırı koymamışsın.");
  });
});

describe("not araması", () => {
  it("notta geçen sözcük tüm kayıtlarda aranır", () => {
    const a = sor("konser için ne ödedim");
    expect(metin(a)).toBe("Toplamda “Konser” için 1.800 TRY harcadın.");
    expect(a.rows[0].label).toBe("Konser bileti - Duman");
  });

  it("notta yoksa eş anlamlı kategoriye bakar ve bunu söyler", () => {
    const a = sor("bu ay benzine ne kadar verdim");
    expect(metin(a)).toBe("Bu ay Akaryakıt için 2.500 TRY harcadın.");
    expect(a.context.join(" ")).toContain("Akaryakıt kategorisine baktım");
  });

  it("hiçbir yerde yoksa 'bulamadım' der, toplam uydurmaz", () => {
    const a = sor("paraşüt için ne ödedim");
    expect(a.kind).toBe("notFound");
    // Kullanıcının yazdığı hâliyle, Türkçe harfleriyle.
    expect(metin(a)).toContain("“paraşüt”");
  });

  it("notta yoksa kategorinin bir PARÇASI için tamamını vermez, önerir", () => {
    // Tiyatro ⊂ Eğlence: Eğlence toplamını "tiyatro" diye vermek yanlış olurdu.
    const a = sor("tiyatro için ne ödedim");
    expect(a.kind).toBe("notFound");
    expect(metin(a)).toBe("Notlarında “tiyatro” geçen bir harcama bulamadım. İstersen Eğlence kategorisinin tamamına bakayım.");
    expect(a.suggestions).toEqual(["Bu ay Eğlence için ne kadar harcadım?"]);
  });

  it("kategori içinde not daraltır", () => {
    expect(metin(sor("elektrik faturası ne kadar"))).toBe("Bu ay “Elektrik” için 1.200 TRY harcadın.");
  });
});

describe("boş sonuçlar", () => {
  it("dönem boşsa en son ne zaman olduğunu söyler", () => {
    expect(metin(sor("bugün ne kadar harcadım"))).toBe("Bugün harcama kaydın yok. En son 12 Ekim'de 400 TRY harcamışsın.");
  });

  it("dönem kayıtlardan önceyse bunu söyler", () => {
    expect(metin(sor("2025 yılında ne harcadım"))).toBe("2025 yılında harcama kaydın yok. Kayıtların 1 Ocak'tan başlıyor.");
  });

  it("hiç kayıt yoksa", () => {
    expect(sor("bu ay ne kadar harcadım", []).kind).toBe("empty");
  });
});

describe("kapsam dışı ve sohbet", () => {
  it("yatırım sorusu Yatırımlar sayfasına yönlendirilir", () => {
    const a = sor("dolar kaç");
    expect(a.kind).toBe("notFound");
    expect(a.link?.href).toBe("/investments");
  });

  it("yardım örnek sorular verir", () => {
    expect(sor("ne sorabilirim").suggestions.length).toBeGreaterThan(0);
  });
});
