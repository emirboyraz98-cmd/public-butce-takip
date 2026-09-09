import { describe, expect, it } from "vitest";

import {
  escapeCsvValue,
  formatCsvDate,
  formatCsvMonth,
  formatCsvNumber,
  toCsv,
} from "./csv";

describe("formatCsvDate", () => {
  it("ISO tarihi Türkçe biçime çevirir", () => {
    // ISO biçimi Excel'in TR yerelinde metin olarak kalıyordu.
    expect(formatCsvDate("2026-08-03")).toBe("03.08.2026");
  });

  it("bozuk girdiyi olduğu gibi bırakır", () => {
    expect(formatCsvDate("")).toBe("");
    expect(formatCsvDate("2026-08")).toBe("2026-08");
  });
});

describe("formatCsvMonth", () => {
  it("yyyy-MM'yi MM.yyyy yapar", () => {
    expect(formatCsvMonth("2026-08")).toBe("08.2026");
  });
});

describe("escapeCsvValue", () => {
  it("ayraç içeren değeri tırnaklar", () => {
    expect(escapeCsvValue("Market; Migros")).toBe('"Market; Migros"');
  });

  it("içerideki tırnağı ikiye katlar", () => {
    expect(escapeCsvValue('12" ekran')).toBe('"12"" ekran"');
  });

  it("sade değeri olduğu gibi bırakır", () => {
    expect(escapeCsvValue("Market")).toBe("Market");
  });
});

describe("toCsv", () => {
  it("BOM, noktalı virgül ve CRLF ile yazar", () => {
    const out = toCsv(["A", "B"], [["1", "2"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("A;B\r\n1;2\r\n");
  });
});

describe("formatCsvNumber", () => {
  it("ondalık ayracı virgül yapar", () => {
    expect(formatCsvNumber("1234.56")).toBe("1234,56");
  });
});
