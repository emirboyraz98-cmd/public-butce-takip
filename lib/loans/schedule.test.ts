import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  installmentForMonth,
  installmentSchedule,
  uncheckedTotal,
  isOpenEnded,
  loanEntriesForMonth,
  monthDiff,
  summarizeLoan,
  type LoanInput,
} from "./schedule";

/** 2026-01 → 2026-12, ilk yarısı 15.000, temmuzdan sonra 18.000. */
const konut: LoanInput = {
  id: "konut",
  name: "Konut Kredisi",
  currency: "TRY",
  startMonth: "2026-01",
  endMonth: "2026-12",
  periods: [
    { effectiveFrom: "2026-01", amount: "15000" },
    { effectiveFrom: "2026-07", amount: "18000" },
  ],
};

/** Paralel ikinci kredi — maaştaki tek zaman çizgisi modelini kırar. */
const tasit: LoanInput = {
  id: "tasit",
  name: "Taşıt Kredisi",
  currency: "TRY",
  startMonth: "2026-03",
  endMonth: "2026-08",
  periods: [{ effectiveFrom: "2026-03", amount: "5000" }],
};

describe("installmentForMonth", () => {
  it("dönemin tutarını verir", () => {
    expect(installmentForMonth(konut, "2026-01")?.toString()).toBe("15000");
    expect(installmentForMonth(konut, "2026-06")?.toString()).toBe("15000");
  });

  it("yeni dönem başlayınca tutarı günceller", () => {
    expect(installmentForMonth(konut, "2026-07")?.toString()).toBe("18000");
    expect(installmentForMonth(konut, "2026-12")?.toString()).toBe("18000");
  });

  it("başlangıçtan önce taksit yoktur", () => {
    expect(installmentForMonth(konut, "2025-12")).toBeNull();
  });

  it("bitişten sonra taksit yoktur", () => {
    // Krediyi sonlandıran şey budur; olmazsa projeksiyon sonsuza gider.
    expect(installmentForMonth(konut, "2027-01")).toBeNull();
  });

  it("kredinin başlangıcı ilk dönemden önceyse ilk dönemin tutarı geçerlidir", () => {
    // Bu aylar eskiden hiçbir toplama girmiyordu: 12 aylık kredi 10 taksit
    // sayılıyor, kalan borç ve toplam ödeme olduğundan düşük çıkıyordu.
    const bosluklu: LoanInput = {
      ...konut,
      startMonth: "2025-10",
      periods: [{ effectiveFrom: "2026-01", amount: "15000" }],
    };
    expect(installmentForMonth(bosluklu, "2025-11")?.toString()).toBe("15000");
    expect(installmentForMonth(bosluklu, "2026-01")?.toString()).toBe("15000");
  });

  it("dönemi hiç olmayan kredide taksit yoktur", () => {
    expect(
      installmentForMonth({ ...konut, periods: [] }, "2026-05")
    ).toBeNull();
  });

  it("dönemler sırasız verilse de en geç geçerli olanı seçer", () => {
    const karisik: LoanInput = {
      ...konut,
      periods: [
        { effectiveFrom: "2026-07", amount: "18000" },
        { effectiveFrom: "2026-01", amount: "15000" },
      ],
    };
    expect(installmentForMonth(karisik, "2026-08")?.toString()).toBe("18000");
  });

  it("süresiz kredide bitiş kontrolü yapmaz", () => {
    const suresiz: LoanInput = { ...konut, endMonth: null };
    expect(installmentForMonth(suresiz, "2030-05")?.toString()).toBe("18000");
  });
});

describe("loanEntriesForMonth — paralel krediler", () => {
  it("aynı ayda iki krediyi de ayrı ayrı döner (biri diğerini ezmez)", () => {
    const entries = loanEntriesForMonth([konut, tasit], "2026-04");
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.amount.toString()).sort()).toEqual([
      "15000",
      "5000",
    ]);
  });

  it("sadece o ay aktif olanları döner", () => {
    // Taşıt kredisi martta başlar, ocakta henüz yoktur.
    const ocak = loanEntriesForMonth([konut, tasit], "2026-01");
    expect(ocak.map((e) => e.loanId)).toEqual(["konut"]);

    // Taşıt ağustosta biter, eylülde sadece konut kalır.
    const eylul = loanEntriesForMonth([konut, tasit], "2026-09");
    expect(eylul.map((e) => e.loanId)).toEqual(["konut"]);
  });

  it("hiç kredi aktif değilse boş döner", () => {
    expect(loanEntriesForMonth([konut, tasit], "2027-06")).toEqual([]);
  });

  it("kredi adı ve para birimini taşır", () => {
    const [entry] = loanEntriesForMonth([tasit], "2026-03");
    expect(entry.name).toBe("Taşıt Kredisi");
    expect(entry.currency).toBe("TRY");
  });
});

describe("isOpenEnded", () => {
  it("bitişi olmayan krediyi işaretler", () => {
    expect(isOpenEnded({ endMonth: null })).toBe(true);
    expect(isOpenEnded({ endMonth: "2026-12" })).toBe(false);
  });
});

describe("monthDiff", () => {
  it("aynı yıl içinde farkı verir", () => {
    expect(monthDiff("2026-01", "2026-12")).toBe(11);
  });

  it("yıl sınırını aşar", () => {
    expect(monthDiff("2025-11", "2026-02")).toBe(3);
  });

  it("geriye doğru negatif verir", () => {
    expect(monthDiff("2026-05", "2026-02")).toBe(-3);
  });
});

describe("installmentSchedule", () => {
  it("her taksit ayını tutarıyla listeler", () => {
    const schedule = installmentSchedule(konut, "2026-08");
    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toMatchObject({ month: "2026-01", past: true });
    expect(schedule[0].amount.toString()).toBe("15000");
    expect(schedule[11]).toMatchObject({ month: "2026-12", past: false });
    expect(schedule[11].amount.toString()).toBe("18000");
  });

  it("dönem değişimini doğru yerde yansıtır", () => {
    const schedule = installmentSchedule(konut, "2026-08");
    expect(schedule[5].amount.toString()).toBe("15000"); // haziran
    expect(schedule[6].amount.toString()).toBe("18000"); // temmuz
  });

  it("geçmiş ayları işaretler", () => {
    const schedule = installmentSchedule(konut, "2026-08");
    expect(schedule.filter((s) => s.past).map((s) => s.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("elle işaretlenen ayları taşır", () => {
    const schedule = installmentSchedule(konut, "2026-08", ["2026-01", "2026-03"]);
    expect(schedule.filter((s) => s.paid).map((s) => s.month)).toEqual([
      "2026-01",
      "2026-03",
    ]);
  });

  it("takvim toplamı, kredinin toplam borcuna eşittir", () => {
    // 6×15.000 + 6×18.000 = 198.000
    const total = installmentSchedule(konut, "2026-08").reduce(
      (sum, s) => sum.plus(s.amount),
      new Decimal(0)
    );
    expect(total.toString()).toBe("198000");
  });

  it("takvim, kredinin her ayını kapsar (boşluk bırakmaz)", () => {
    // Kredi ocakta başlıyor ama ilk dönem marttan tanımlı; yine de 12 satır.
    const bosluklu: LoanInput = {
      id: "b",
      name: "Boşluklu",
      currency: "TRY",
      startMonth: "2026-01",
      endMonth: "2026-12",
      periods: [{ effectiveFrom: "2026-03", amount: "1000" }],
    };
    const schedule = installmentSchedule(bosluklu, "2026-08");
    expect(schedule).toHaveLength(12);
    expect(schedule[0].month).toBe("2026-01");
    expect(schedule[0].amount.toString()).toBe("1000");
    expect(summarizeLoan(bosluklu, "2026-08").totalPayable?.toString()).toBe(
      "12000"
    );
  });

  it("takvim satır sayısı, bildirilen taksit sayısıyla tutar", () => {
    // İkisi ayrı yollarla hesaplanıyor; ayrışırlarsa toplamlar sessizce
    // yanlış çıkar.
    for (const loan of [konut, tasit]) {
      const schedule = installmentSchedule(loan, "2026-08");
      expect(schedule).toHaveLength(summarizeLoan(loan, "2026-08").totalInstallments!);
    }
  });

  it("süresiz kredide takvim üretmez", () => {
    // Sonsuz liste anlamsız olurdu; arayüz bunun yerine uyarı gösterir.
    expect(installmentSchedule({ ...konut, endMonth: null }, "2026-08")).toEqual([]);
  });
});

describe("uncheckedTotal", () => {
  it("işaretlenmemiş taksitleri toplar", () => {
    const schedule = installmentSchedule(konut, "2026-08", [
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    // 198.000 - 3×15.000 = 153.000
    expect(uncheckedTotal(schedule).toString()).toBe("153000");
  });

  it("hiçbiri işaretli değilse toplam borcu verir", () => {
    expect(uncheckedTotal(installmentSchedule(konut, "2026-08")).toString()).toBe(
      "198000"
    );
  });

  it("hepsi işaretliyse sıfır döner", () => {
    const months = installmentSchedule(konut, "2026-08").map((s) => s.month);
    const schedule = installmentSchedule(konut, "2026-08", months);
    expect(uncheckedTotal(schedule).toString()).toBe("0");
  });
});

describe("summarizeLoan", () => {
  it("toplam taksit sayısını verir", () => {
    expect(summarizeLoan(konut, "2026-01").totalInstallments).toBe(12);
  });

  it("kalan borç İÇİNDE BULUNULAN AYI DA kapsar", () => {
    // Ağustostayken ağustos taksiti hâlâ ödenecekler arasındadır; toplam
    // borçtan bu ayı düşmek yanlış olurdu.
    const summary = summarizeLoan(konut, "2026-08");
    expect(summary.remainingInstallments).toBe(5); // ağustos–aralık
    expect(summary.remainingTotal?.toString()).toBe("90000"); // 5 × 18.000
    // Ödenen ise bu ayı KAPSAMAZ: ocak–temmuz.
    expect(summary.paidTotal.toString()).toBe("108000");
  });

  it("kalan taksit ve tutarı hesaplar", () => {
    // Temmuz itibarıyla: temmuz–aralık = 6 taksit × 18.000
    const summary = summarizeLoan(konut, "2026-07");
    expect(summary.remainingInstallments).toBe(6);
    expect(summary.remainingTotal?.toString()).toBe("108000");
  });

  it("ödenmiş tutarı dönem değişimiyle birlikte toplar", () => {
    // Ağustos itibarıyla ödenmiş: ocak–haziran 6×15.000 + temmuz 18.000
    expect(summarizeLoan(konut, "2026-08").paidTotal.toString()).toBe("108000");
  });

  it("kredi bittikten sonra kalan sıfırdır", () => {
    const summary = summarizeLoan(konut, "2027-03");
    expect(summary.remainingInstallments).toBe(0);
    expect(summary.remainingTotal?.toString()).toBe("0");
  });

  it("kredi başlamadan önce hiçbir şey ödenmemiştir", () => {
    const summary = summarizeLoan(konut, "2026-01");
    expect(summary.paidTotal.toString()).toBe("0");
    expect(summary.remainingInstallments).toBe(12);
  });

  it("toplam ödeme = ödenen + kalan", () => {
    for (const month of ["2026-01", "2026-05", "2026-08", "2026-12", "2027-03"]) {
      const summary = summarizeLoan(konut, month);
      expect(summary.totalPayable?.toString()).toBe(
        summary.paidTotal.plus(summary.remainingTotal ?? 0).toString()
      );
    }
  });

  it("toplam ödeme hangi aydan bakılırsa bakılsın aynıdır", () => {
    // 6×15.000 + 6×18.000
    for (const month of ["2026-01", "2026-07", "2027-06"]) {
      expect(summarizeLoan(konut, month).totalPayable?.toString()).toBe("198000");
    }
  });

  it("süresiz kredide toplam ödeme hesaplanamaz", () => {
    expect(summarizeLoan({ ...konut, endMonth: null }, "2026-08").totalPayable).toBeNull();
  });

  it("süresiz kredide kalan hesaplanamaz", () => {
    const suresiz: LoanInput = { ...konut, endMonth: null };
    const summary = summarizeLoan(suresiz, "2026-07");
    expect(summary.totalInstallments).toBeNull();
    expect(summary.remainingInstallments).toBeNull();
    expect(summary.remainingTotal).toBeNull();
    // Geçmişi bilinir; ödenmiş tutar yine de hesaplanır.
    expect(summary.paidTotal.toString()).toBe("90000");
  });

  it("toplam = ödenen + kalan", () => {
    const summary = summarizeLoan(konut, "2026-05");
    const toplam = summary.paidTotal.plus(summary.remainingTotal ?? 0);
    // 6×15.000 + 6×18.000
    expect(toplam.toString()).toBe(new Decimal(198000).toString());
  });
});
