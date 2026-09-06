import { describe, expect, it } from "vitest";

import { escapeCsvValue, formatCsvNumber, toCsv, UTF8_BOM } from "./csv";
import { buildMoneyRows, MONEY_CSV_HEADERS } from "./moneyRows";

describe("csv", () => {
  it("sade değerleri tırnaklamaz", () => {
    expect(escapeCsvValue("Market")).toBe("Market");
  });

  it("ayraç, tırnak ve satır sonu içerenleri tırnaklar", () => {
    expect(escapeCsvValue("a;b")).toBe('"a;b"');
    expect(escapeCsvValue('di"yor')).toBe('"di""yor"');
    expect(escapeCsvValue("iki\nsatır")).toBe('"iki\nsatır"');
  });

  it("ondalık ayracını virgüle çevirir", () => {
    expect(formatCsvNumber("1234.50")).toBe("1234,50");
    expect(formatCsvNumber("1000")).toBe("1000");
  });

  it("BOM, noktalı virgül ve CRLF ile yazar", () => {
    const csv = toCsv(["A", "B"], [["1", "2"]]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain("A;B\r\n");
    expect(csv).toContain("1;2\r\n");
  });
});

describe("buildMoneyRows", () => {
  const base = { incomes: [], expenses: [], loans: [], asOfMonth: "2026-08" };

  it("geliri ve gideri türüyle birlikte yazar", () => {
    const rows = buildMoneyRows({
      ...base,
      incomes: [
        {
          date: "2026-08-05",
          categoryName: "Maaş",
          amount: "30000",
          currency: "TRY",
          frequency: "MONTHLY",
          note: null,
        },
      ],
      expenses: [
        {
          date: "2026-08-07",
          categoryName: "Market",
          amount: "1250.75",
          currency: "TRY",
          frequency: "ONE_TIME",
          note: "haftalık",
          kind: "OTHER",
          paymentMonth: null,
          installmentCount: 1,
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].slice(0, 7)).toEqual([
      "Gelir",
      "2026-08-05",
      "2026-08",
      "Maaş",
      "30000",
      "TRY",
      "Aylık",
    ]);
    expect(rows[1][0]).toBe("Gider");
    expect(rows[1][4]).toBe("1250,75");
    expect(rows[1][9]).toBe("haftalık");
  });

  it("kredi kartı harcamasını ayrı tür olarak ve taksitiyle yazar", () => {
    const [row] = buildMoneyRows({
      ...base,
      expenses: [
        {
          date: "2026-07-20",
          categoryName: "Elektronik",
          amount: "12000",
          currency: "TRY",
          frequency: "ONE_TIME",
          note: null,
          kind: "CREDIT_CARD",
          paymentMonth: "2026-08",
          installmentCount: 6,
        },
      ],
    });

    expect(row[0]).toBe("Kredi Kartı");
    expect(row[7]).toBe("2026-08");
    expect(row[8]).toBe("6");
  });

  it("krediyi taksit takvimine yayar", () => {
    const rows = buildMoneyRows({
      ...base,
      loans: [
        {
          name: "Konut Kredisi",
          currency: "TRY",
          startMonth: "2026-07",
          endMonth: "2026-09",
          paidMonths: ["2026-07"],
          periods: [{ effectiveFrom: "2026-07", amount: "5000" }],
        },
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[2])).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(rows[0][3]).toBe("Konut Kredisi");
    expect(rows[0][4]).toBe("5000,00");
    expect(rows[0][9]).toBe("Ödendi olarak işaretli");
    expect(rows[1][9]).toBe("");
  });

  it("süresiz krediyi tek satırla belirtir", () => {
    const rows = buildMoneyRows({
      ...base,
      loans: [
        {
          name: "İhtiyaç Kredisi",
          currency: "TRY",
          startMonth: "2026-07",
          endMonth: null,
          paidMonths: [],
          periods: [{ effectiveFrom: "2026-07", amount: "3000" }],
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0][4]).toBe("");
    expect(rows[0][9]).toContain("Süresiz");
  });

  it("satırları aya göre sıralar", () => {
    const rows = buildMoneyRows({
      ...base,
      incomes: [
        {
          date: "2026-09-01",
          categoryName: "Kira Geliri",
          amount: "5000",
          currency: "TRY",
          frequency: "MONTHLY",
          note: null,
        },
      ],
      expenses: [
        {
          date: "2026-06-01",
          categoryName: "Vergi",
          amount: "800",
          currency: "TRY",
          frequency: "ONE_TIME",
          note: null,
          kind: "OTHER",
          paymentMonth: null,
          installmentCount: 1,
        },
      ],
    });

    expect(rows.map((r) => r[2])).toEqual(["2026-06", "2026-09"]);
  });

  it("başlık sayısı satır sütun sayısıyla uyuşur", () => {
    const rows = buildMoneyRows({
      ...base,
      incomes: [
        {
          date: "2026-08-05",
          categoryName: "Maaş",
          amount: "30000",
          currency: "TRY",
          frequency: "MONTHLY",
          note: null,
        },
      ],
    });

    expect(rows[0]).toHaveLength(MONEY_CSV_HEADERS.length);
  });
});
