import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  statementTotalsByCurrency,
  cashAmountForMonth,
  installmentMonths,
  splitInstallments,
  appliesToCashMonth,
  appliesToSpendMonth,
  cashMonthOf,
  isValidPaymentMonth,
  monthOf,
  paymentMonthOptions,
  paymentOffsetOf,
  shiftMonth,
  suggestPaymentMonth,
} from "./creditCard";

describe("shiftMonth", () => {
  it("ay ekler ve çıkarır", () => {
    expect(shiftMonth("2026-07", 1)).toBe("2026-08");
    expect(shiftMonth("2026-07", -1)).toBe("2026-06");
  });

  it("yıl sınırını aşar", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthOf", () => {
  it("tarihten ayı çıkarır", () => {
    expect(monthOf("2026-07-23")).toBe("2026-07");
  });

  it("ayın son gününde de aynı ayı verir", () => {
    expect(monthOf("2026-07-31")).toBe("2026-07");
  });
});

describe("suggestPaymentMonth", () => {
  it("1 ay gecikmede temmuz harcaması ağustosta ödenir", () => {
    // Kullanıcının durumu: temmuz ekstresi 8 ağustosta ödeniyor.
    expect(suggestPaymentMonth("2026-07-23", 1)).toBe("2026-08");
  });

  it("gecikme yoksa harcamanın kendi ayını verir", () => {
    expect(suggestPaymentMonth("2026-07-23", 0)).toBe("2026-07");
  });

  it("2 ay gecikmeyi de destekler", () => {
    expect(suggestPaymentMonth("2026-07-23", 2)).toBe("2026-09");
  });

  it("aralık harcaması ocakta ödenir", () => {
    expect(suggestPaymentMonth("2026-12-30", 1)).toBe("2027-01");
  });
});

describe("cashMonthOf", () => {
  it("ödeme ayı varsa onu kullanır — harcama ayını değil", () => {
    // Nakit akışının doğruluğu buna bağlı: para ağustosta çıkıyor.
    expect(
      cashMonthOf({ date: "2026-07-23", paymentMonth: "2026-08" })
    ).toBe("2026-08");
  });

  it("ödeme ayı yoksa harcamanın kendi ayına düşer", () => {
    expect(cashMonthOf({ date: "2026-07-23", paymentMonth: null })).toBe(
      "2026-07"
    );
  });
});

describe("isValidPaymentMonth", () => {
  it("harcama ayını ve sonrasını kabul eder", () => {
    expect(isValidPaymentMonth("2026-07-23", "2026-07")).toBe(true);
    expect(isValidPaymentMonth("2026-07-23", "2026-08")).toBe(true);
    expect(isValidPaymentMonth("2026-07-23", "2027-01")).toBe(true);
  });

  it("harcamadan önceki ayı reddeder", () => {
    // Kart harcaması ödendikten sonra yapılamaz.
    expect(isValidPaymentMonth("2026-07-23", "2026-06")).toBe(false);
  });

  it("bozuk biçimi reddeder", () => {
    expect(isValidPaymentMonth("2026-07-23", "2026-13")).toBe(false);
    expect(isValidPaymentMonth("2026-07-23", "2026-7")).toBe(false);
    expect(isValidPaymentMonth("2026-07-23", "saçma")).toBe(false);
  });
});

describe("paymentMonthOptions", () => {
  it("harcama ayından başlayıp ileriye doğru gider", () => {
    expect(paymentMonthOptions("2026-07-23", 3)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("yıl sınırını aşar", () => {
    expect(paymentMonthOptions("2026-11-05", 3)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("ürettiği her seçenek geçerlidir", () => {
    for (const option of paymentMonthOptions("2026-07-23")) {
      expect(isValidPaymentMonth("2026-07-23", option)).toBe(true);
    }
  });
});

describe("paymentOffsetOf", () => {
  it("kaydın kendi gecikmesini çıkarır", () => {
    expect(
      paymentOffsetOf({ date: "2026-07-23", paymentMonth: "2026-08" })
    ).toBe(1);
    expect(
      paymentOffsetOf({ date: "2026-11-05", paymentMonth: "2027-01" })
    ).toBe(2);
  });

  it("ödeme ayı yoksa gecikme sıfırdır", () => {
    expect(paymentOffsetOf({ date: "2026-07-23", paymentMonth: null })).toBe(0);
  });
});

describe("appliesToCashMonth — tek seferlik", () => {
  const harcama = {
    date: "2026-07-23",
    paymentMonth: "2026-08",
    frequency: "ONE_TIME" as const,
  };

  it("yalnızca ödeme ayında para çıkarır", () => {
    expect(appliesToCashMonth(harcama, "2026-08")).toBe(true);
  });

  it("harcamanın yapıldığı ayda para çıkmaz", () => {
    // Nakit akışının doğruluğu buna bağlı; temmuzde henüz ödeme yok.
    expect(appliesToCashMonth(harcama, "2026-07")).toBe(false);
  });

  it("sonraki aylarda tekrar etmez", () => {
    expect(appliesToCashMonth(harcama, "2026-09")).toBe(false);
  });
});

describe("appliesToCashMonth — aylık tekrarlayan (abonelik)", () => {
  // Temmuzda başlayan aylık abonelik, 1 ay gecikmeyle ödeniyor.
  const abonelik = {
    date: "2026-07-10",
    paymentMonth: "2026-08",
    frequency: "MONTHLY" as const,
  };

  it("ilk ödeme, harcama ayının gecikmeli karşılığında başlar", () => {
    expect(appliesToCashMonth(abonelik, "2026-07")).toBe(false);
    expect(appliesToCashMonth(abonelik, "2026-08")).toBe(true);
  });

  it("sonraki her ay tekrar eder", () => {
    expect(appliesToCashMonth(abonelik, "2026-09")).toBe(true);
    expect(appliesToCashMonth(abonelik, "2027-03")).toBe(true);
  });

  it("başlangıçtan önce hiç çıkmaz", () => {
    expect(appliesToCashMonth(abonelik, "2026-06")).toBe(false);
  });

  it("gecikme sıfırsa kendi ayından itibaren tekrar eder", () => {
    const nakitGibi = { ...abonelik, paymentMonth: "2026-07" };
    expect(appliesToCashMonth(nakitGibi, "2026-07")).toBe(true);
  });
});

describe("appliesToSpendMonth — harcama alışkanlığı görünümü", () => {
  it("tek seferlik harcamayı yapıldığı aya yazar", () => {
    const harcama = {
      date: "2026-07-23",
      frequency: "ONE_TIME" as const,
    };
    // Ödeme ağustosta olsa da alışkanlık analizinde temmuza yazılır.
    expect(appliesToSpendMonth(harcama, "2026-07")).toBe(true);
    expect(appliesToSpendMonth(harcama, "2026-08")).toBe(false);
  });

  it("aylık harcamayı başlangıçtan itibaren her aya yazar", () => {
    const abonelik = { date: "2026-07-10", frequency: "MONTHLY" as const };
    expect(appliesToSpendMonth(abonelik, "2026-06")).toBe(false);
    expect(appliesToSpendMonth(abonelik, "2026-07")).toBe(true);
    expect(appliesToSpendMonth(abonelik, "2026-12")).toBe(true);
  });
});

describe("splitInstallments", () => {
  it("tam bölünen tutarı eşit paylaştırır", () => {
    const parts = splitInstallments("1200", 3);
    expect(parts.map((p) => p.toString())).toEqual(["400", "400", "400"]);
  });

  it("kuruş artığını son taksite ekler", () => {
    // 1000 / 3 = 333,333... Eşit yuvarlansa toplam 999,99 olurdu.
    const parts = splitInstallments("1000", 3);
    expect(parts.map((p) => p.toString())).toEqual(["333.33", "333.33", "333.34"]);
  });

  it("taksitlerin toplamı her zaman girilen tutara eşittir", () => {
    for (const total of ["1000", "999.99", "17.5", "123456.78", "0.03"]) {
      for (const count of [1, 2, 3, 6, 7, 12]) {
        const sum = splitInstallments(total, count).reduce(
          (acc, p) => acc.plus(p),
          new Decimal(0)
        );
        expect(sum.toString()).toBe(new Decimal(total).toString());
      }
    }
  });

  it("tek çekimde tutarın tamamını tek parça döner", () => {
    expect(splitInstallments("2400", 1).map((p) => p.toString())).toEqual(["2400"]);
  });

  it("taksit sayısı tutardan büyükse bile toplamı korur", () => {
    const parts = splitInstallments("0.05", 12);
    const sum = parts.reduce((acc, p) => acc.plus(p), new Decimal(0));
    expect(sum.toString()).toBe("0.05");
  });
});

describe("installmentMonths", () => {
  const base = {
    date: "2026-07-23",
    paymentMonth: "2026-08",
    frequency: "ONE_TIME" as const,
    amount: "1200",
  };

  it("ilk ödeme ayından itibaren ardışık ayları verir", () => {
    expect(installmentMonths({ ...base, installmentCount: 3 })).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("yıl sınırını aşar", () => {
    expect(installmentMonths({ ...base, paymentMonth: "2026-11", installmentCount: 4 })).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("tek çekimde tek ay döner", () => {
    expect(installmentMonths({ ...base, installmentCount: 1 })).toEqual(["2026-08"]);
  });
});

describe("cashAmountForMonth", () => {
  const taksitli = {
    date: "2026-07-23",
    paymentMonth: "2026-08",
    frequency: "ONE_TIME" as const,
    amount: "1200",
    installmentCount: 3,
  };

  it("her taksit ayında yalnızca o ayın taksitini çıkarır", () => {
    expect(cashAmountForMonth(taksitli, "2026-08").toString()).toBe("400");
    expect(cashAmountForMonth(taksitli, "2026-09").toString()).toBe("400");
    expect(cashAmountForMonth(taksitli, "2026-10").toString()).toBe("400");
  });

  it("taksit aralığının dışında sıfır döner", () => {
    expect(cashAmountForMonth(taksitli, "2026-07").toString()).toBe("0");
    expect(cashAmountForMonth(taksitli, "2026-11").toString()).toBe("0");
  });

  it("aylara dağılan tutarların toplamı harcamanın tamamıdır", () => {
    const total = ["2026-08", "2026-09", "2026-10"].reduce(
      (acc, m) => acc.plus(cashAmountForMonth(taksitli, m)),
      new Decimal(0)
    );
    expect(total.toString()).toBe("1200");
  });

  it("kuruş artığı son taksitte çıkar", () => {
    const e = { ...taksitli, amount: "1000" };
    expect(cashAmountForMonth(e, "2026-08").toString()).toBe("333.33");
    expect(cashAmountForMonth(e, "2026-10").toString()).toBe("333.34");
  });

  it("tek çekimde tutarın tamamı ödeme ayında çıkar", () => {
    const tek = { ...taksitli, installmentCount: 1 };
    expect(cashAmountForMonth(tek, "2026-08").toString()).toBe("1200");
    expect(cashAmountForMonth(tek, "2026-09").toString()).toBe("0");
  });

  it("aylık tekrarlayan kayıt taksitlendirilmez, her ay tam tutar çıkar", () => {
    // Abonelik: taksit mantığı uygulanmaz, her tekrar tam bedeldir.
    const abonelik = {
      ...taksitli,
      frequency: "MONTHLY" as const,
      installmentCount: 1,
      amount: "250",
    };
    expect(cashAmountForMonth(abonelik, "2026-08").toString()).toBe("250");
    expect(cashAmountForMonth(abonelik, "2026-12").toString()).toBe("250");
    expect(cashAmountForMonth(abonelik, "2026-07").toString()).toBe("0");
  });
});

describe("taksit, kategori dağılımını bölmez", () => {
  it("harcama ayı görünümünde tutar bölünmeden tek ayda kalır", () => {
    // Alışkanlık analizinde 12.000'lik telefon, alındığı ayda 12.000'dir;
    // 12 aya bölünmüş hali yalnızca nakit akışını ilgilendirir.
    const telefon = {
      date: "2026-07-23",
      paymentMonth: "2026-08",
      frequency: "ONE_TIME" as const,
      amount: "12000",
      installmentCount: 12,
    };

    expect(appliesToSpendMonth(telefon, "2026-07")).toBe(true);
    expect(appliesToSpendMonth(telefon, "2026-08")).toBe(false);
    expect(cashAmountForMonth(telefon, "2026-08").toString()).toBe("1000");
  });
});

describe("harcama ayı ile ödeme ayı birbirine karışmaz", () => {
  it("aynı kayıt iki görünümde farklı aylara düşer", () => {
    const harcama = {
      date: "2026-07-23",
      paymentMonth: "2026-08",
      frequency: "ONE_TIME" as const,
    };

    // Alışkanlık: temmuz. Nakit: ağustos. İkisi aynı olursa biri yanlıştır.
    expect(appliesToSpendMonth(harcama, "2026-07")).toBe(true);
    expect(appliesToCashMonth(harcama, "2026-07")).toBe(false);
    expect(appliesToSpendMonth(harcama, "2026-08")).toBe(false);
    expect(appliesToCashMonth(harcama, "2026-08")).toBe(true);
  });
});

describe("statementTotalsByCurrency", () => {
  const months = ["2026-07", "2026-08", "2026-09"];

  it("aynı ayın harcamalarını toplar", () => {
    const totals = statementTotalsByCurrency(
      [
        { date: "2026-07-10", paymentMonth: "2026-08", frequency: "ONE_TIME", amount: "2400", installmentCount: 1, currency: "TRY" },
        { date: "2026-07-20", paymentMonth: "2026-08", frequency: "ONE_TIME", amount: "1600", installmentCount: 1, currency: "TRY" },
      ],
      months
    );
    expect(totals.get("TRY")!.get("2026-08")!.toString()).toBe("4000");
  });

  it("taksitleri aylara böler", () => {
    const totals = statementTotalsByCurrency(
      [{ date: "2026-07-10", paymentMonth: "2026-08", frequency: "ONE_TIME", amount: "1200", installmentCount: 3, currency: "TRY" }],
      months
    );
    const t = totals.get("TRY")!;
    expect(t.get("2026-08")!.toString()).toBe("400");
    expect(t.get("2026-09")!.toString()).toBe("400");
    expect(t.get("2026-07")).toBeUndefined();
  });

  it("para birimlerini ayrı tutar", () => {
    const totals = statementTotalsByCurrency(
      [
        { date: "2026-07-10", paymentMonth: "2026-08", frequency: "ONE_TIME", amount: "1000", installmentCount: 1, currency: "TRY" },
        { date: "2026-07-11", paymentMonth: "2026-08", frequency: "ONE_TIME", amount: "50", installmentCount: 1, currency: "USD" },
      ],
      months
    );
    expect(totals.get("TRY")!.get("2026-08")!.toString()).toBe("1000");
    expect(totals.get("USD")!.get("2026-08")!.toString()).toBe("50");
  });

  it("kayıt yoksa boş döner", () => {
    expect(statementTotalsByCurrency([], months).size).toBe(0);
  });
});
