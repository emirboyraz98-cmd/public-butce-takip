import { describe, expect, it } from "vitest";

import { collectMonthsToCompute } from "./computeAndSave";

const CURRENT_MONTH = "2026-08";

describe("collectMonthsToCompute", () => {
  it("dönemin kapsadığı tüm ayları üretir", () => {
    expect(
      collectMonthsToCompute([{ from: "2026-05", to: "2026-07" }], CURRENT_MONTH)
    ).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("bitişi gelecekte olan dönemleri bugünün ayında KESMEZ", () => {
    // Asıl düzeltme: ileri tarihli girilen çalışma/izin dönemleri de
    // hesaplanmalı; önceden bunlar currentMonth'ta kırpılıyordu.
    expect(
      collectMonthsToCompute([{ from: "2026-07", to: "2026-10" }], CURRENT_MONTH)
    ).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("tamamen gelecekteki bir dönemi de dahil eder", () => {
    expect(
      collectMonthsToCompute([{ from: "2026-11", to: "2026-12" }], CURRENT_MONTH)
    ).toEqual(["2026-11", "2026-12"]);
  });

  it("açık uçlu dönemi (to = null) içinde bulunulan ayda keser", () => {
    expect(
      collectMonthsToCompute([{ from: "2026-06", to: null }], CURRENT_MONTH)
    ).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("çakışan dönemlerin aylarını tekrarlamaz ve sıralı döner", () => {
    expect(
      collectMonthsToCompute(
        [
          { from: "2026-09", to: "2026-10" },
          { from: "2026-05", to: "2026-06" },
          { from: "2026-06", to: "2026-09" },
        ],
        CURRENT_MONTH
      )
    ).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("kaynak yoksa boş liste döner", () => {
    expect(collectMonthsToCompute([], CURRENT_MONTH)).toEqual([]);
  });

  it("ters aralığı (bitiş < başlangıç) yok sayar", () => {
    expect(
      collectMonthsToCompute([{ from: "2026-09", to: "2026-07" }], CURRENT_MONTH)
    ).toEqual([]);
  });
});

describe("açık uçlu ve GELECEKTE başlayan dönem", () => {
  it("en azından başladığı ayı üretir", () => {
    /*
     * Hata buydu: bitiş `currentMonth`e kırpılınca from > to oluyor ve
     * aralık tamamen boşalıyordu. "Aralık'ta sabit maaşa geçeceğim" deyip
     * bitişi boş bırakan kullanıcının dönemi hiçbir ay üretmiyor, maaş
     * tablosunda da Genel Bakış'ta da hiç görünmüyordu.
     */
    expect(collectMonthsToCompute([{ from: "2026-12", to: null }], "2026-09")).toEqual([
      "2026-12",
    ]);
  });

  it("zaman ilerleyince kendiliğinden büyür", () => {
    expect(collectMonthsToCompute([{ from: "2026-12", to: null }], "2027-02")).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("geçmişte başlayan açık uçlu dönem hâlâ bu ayda kesilir", () => {
    expect(collectMonthsToCompute([{ from: "2026-07", to: null }], "2026-09")).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });
});
