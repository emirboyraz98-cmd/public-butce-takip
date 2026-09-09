import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  buildInvestmentRows,
  buildMonthlyRows,
  buildRecordRows,
  INVESTMENT_HEADERS,
  type ExportExpense,
  type ExportEntry,
  type ExportLoan,
  type ToBase,
} from "./moneyRows";

/** 1 USD = 40 TRY sabit; testlerin kur kaynağına ihtiyacı olmasın. */
const toBase: ToBase = (amount, currency) =>
  currency === "USD" ? amount.mul(40) : amount;

/** Kuru bulunamayan tutarları taklit eder. */
const noRate: ToBase = () => null;

const income = (over: Partial<ExportEntry> = {}): ExportEntry => ({
  date: "2026-08-15",
  categoryName: "Ek gelir",
  amount: "12000",
  currency: "TRY",
  frequency: "ONE_TIME",
  note: null,
  ...over,
});

const expense = (over: Partial<ExportExpense> = {}): ExportExpense => ({
  date: "2026-08-03",
  categoryName: "Market",
  amount: "3120",
  currency: "TRY",
  frequency: "ONE_TIME",
  note: null,
  kind: "OTHER",
  paymentMonth: null,
  installmentCount: 1,
  ...over,
});

const loan = (over: Partial<ExportLoan> = {}): ExportLoan => ({
  name: "Konut",
  currency: "TRY",
  startMonth: "2026-07",
  endMonth: "2026-09",
  paidMonths: [],
  periods: [{ effectiveFrom: "2026-07", amount: "5000" }],
  ...over,
});

const build = (args: Parameters<typeof buildRecordRows>[0]) =>
  buildRecordRows(args);

describe("buildRecordRows", () => {
  it("tarihi Excel'in tanıdığı biçimde yazar", () => {
    // ISO tarih TR Excel'de metin kalıyor; sütun sıralanamıyordu.
    const { rows } = build({
      incomes: [],
      expenses: [expense()],
      baseCurrency: "TRY",
      toBase,
    });
    expect(rows[0][1]).toBe("03.08.2026");
    expect(rows[0][2]).toBe("08.2026");
  });

  it("baz para birimi sütunu karışık para birimlerini toplanabilir yapar", () => {
    const { headers, rows } = build({
      incomes: [],
      expenses: [
        expense({ amount: "29.90", currency: "USD", categoryName: "Abonelik" }),
      ],
      baseCurrency: "TRY",
      toBase,
    });
    expect(headers).toContain("Tutar (TRY)");
    // Kendi para biriminde 29,90 USD; toplanabilir sütunda 1.196,00 TRY.
    expect(rows[0][4]).toBe("29,90");
    expect(rows[0][5]).toBe("USD");
    expect(rows[0][6]).toBe("1196,00");
  });

  it("kur bulunamayan satırda baz sütunu boş kalır", () => {
    // Sıfır yazmak, o kaydı bedavaymış gibi toplama sokardı.
    const { rows } = build({
      incomes: [],
      expenses: [expense({ currency: "USD" })],
      baseCurrency: "TRY",
      toBase: noRate,
    });
    expect(rows[0][6]).toBe("");
  });

  it("her kayıt tek satır — aylık tekrarlayan da dahil", () => {
    const { rows } = build({
      incomes: [],
      expenses: [expense({ frequency: "MONTHLY", date: "2026-01-01" })],
      baseCurrency: "TRY",
      toBase,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0][7]).toBe("Aylık");
  });

  it("kart, nakit ve geliri türüyle ayırır", () => {
    const { rows } = build({
      incomes: [income()],
      expenses: [
        expense(),
        expense({ kind: "CREDIT_CARD", date: "2026-08-05", paymentMonth: "2026-09" }),
      ],
      baseCurrency: "TRY",
      toBase,
    });
    expect(rows.map((r) => r[0])).toEqual(["Gider", "Kredi Kartı", "Gelir"]);
  });

  it("başlık sayısı satır sütun sayısıyla uyuşur", () => {
    const { headers, rows } = build({
      incomes: [income()],
      expenses: [expense()],
      baseCurrency: "TRY",
      toBase,
    });
    for (const r of rows) expect(r).toHaveLength(headers.length);
  });
});

describe("buildMonthlyRows", () => {
  const monthly = (args: Partial<Parameters<typeof buildMonthlyRows>[0]> = {}) =>
    buildMonthlyRows({
      incomes: [],
      expenses: [],
      loans: [],
      salaries: [],
      asOfMonth: "2026-09",
      baseCurrency: "TRY",
      toBase,
      ...args,
    });

  it("aylık tekrarlayan gideri her aya yayar", () => {
    /*
     * Asıl eksik buydu: kira tek satırda duruyordu ve "2026'da kiraya ne
     * verdim" sorusu Excel'de cevaplanamıyordu.
     */
    const { rows } = monthly({
      expenses: [
        expense({ frequency: "MONTHLY", date: "2026-07-01", amount: "18000" }),
      ],
    });
    expect(rows.map((r) => r[0])).toEqual(["07.2026", "08.2026", "09.2026"]);
    expect(rows.every((r) => r[4] === "18000,00")).toBe(true);
  });

  it("taksitli kart harcamasını taksit aylarına böler", () => {
    const { rows } = monthly({
      expenses: [
        expense({
          kind: "CREDIT_CARD",
          date: "2026-07-14",
          paymentMonth: "2026-08",
          amount: "6000",
          installmentCount: 3,
        }),
      ],
    });
    expect(rows.map((r) => r[0])).toEqual(["08.2026", "09.2026", "10.2026"]);
    expect(rows.map((r) => r[4])).toEqual(["2000,00", "2000,00", "2000,00"]);
    expect(rows[0][7]).toBe("1/3. taksit");
  });

  it("krediyi taksit takvimine yayar", () => {
    const { rows } = monthly({ loans: [loan()] });
    expect(rows.map((r) => r[0])).toEqual(["07.2026", "08.2026", "09.2026"]);
    expect(rows.every((r) => r[2] === "Kredi Taksiti")).toBe(true);
  });

  it("süresiz krediyi tek satırla belirtir", () => {
    const { rows } = monthly({ loans: [loan({ endMonth: null })] });
    expect(rows).toHaveLength(1);
    expect(rows[0][7]).toContain("Süresiz");
  });

  it("maaşta gerçekleşen varsa onu yazar, hesaplananı açıklamada tutar", () => {
    const { rows } = monthly({
      salaries: [
        {
          month: "2026-08",
          mode: "VARIABLE",
          currency: "USD",
          total: "4846.79",
          actualAmount: "4800.00",
        },
      ],
    });
    expect(rows[0][4]).toBe("4800,00");
    expect(rows[0][6]).toBe("192000,00"); // 4800 × 40
    expect(rows[0][7]).toContain("4846,79");
  });

  it("gelir ve gideri yön sütunuyla ayırır", () => {
    const { rows } = monthly({
      incomes: [income({ date: "2026-08-15" })],
      expenses: [expense({ date: "2026-08-03" })],
    });
    expect(new Set(rows.map((r) => r[1]))).toEqual(new Set(["Gelir", "Gider"]));
  });

  it("satırları aya göre sıralar", () => {
    const { rows } = monthly({
      expenses: [
        expense({ date: "2026-09-02" }),
        expense({ date: "2026-07-02" }),
        expense({ date: "2026-08-02" }),
      ],
    });
    expect(rows.map((r) => r[0])).toEqual(["07.2026", "08.2026", "09.2026"]);
  });
});

describe("buildInvestmentRows", () => {
  it("işlem tutarını adet × fiyat olarak yazar", () => {
    const rows = buildInvestmentRows([
      {
        date: "2026-03-10",
        type: "BUY",
        symbol: "BTC",
        assetType: "CRYPTO",
        quantity: "0.15",
        price: "62000",
        currency: "USD",
        note: null,
      },
    ]);
    expect(rows[0][0]).toBe("10.03.2026");
    expect(rows[0][2]).toBe("Alış");
    expect(rows[0][8]).toBe("9300,00");
    expect(rows[0]).toHaveLength(INVESTMENT_HEADERS.length);
  });

  it("satışı ayrı yazar", () => {
    const rows = buildInvestmentRows([
      {
        date: "2026-07-04",
        type: "SELL",
        symbol: "AAPL",
        assetType: "STOCK",
        quantity: "8",
        price: "244",
        currency: "USD",
        note: null,
      },
    ]);
    expect(rows[0][2]).toBe("Satış");
    expect(rows[0][8]).toBe("1952,00");
  });
});

describe("Decimal kullanımı", () => {
  it("kuruş kaybı olmadan böler", () => {
    // 1000 / 3 tam bölünmüyor; son taksit farkı üstlenmeli.
    const { rows } = buildMonthlyRows({
      incomes: [],
      expenses: [
        expense({
          kind: "CREDIT_CARD",
          date: "2026-08-01",
          paymentMonth: "2026-09",
          amount: "1000",
          installmentCount: 3,
        }),
      ],
      loans: [],
      salaries: [],
      asOfMonth: "2026-09",
      baseCurrency: "TRY",
      toBase,
    });
    const sum = rows.reduce((acc, r) => acc.plus(r[4].replace(",", ".")), new Decimal(0));
    expect(sum.toFixed(2)).toBe("1000.00");
  });
});
