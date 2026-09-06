import { describe, expect, it } from "vitest";

import {
  derivePositions,
  openPositions,
  totalRealizedPL,
  type TransactionLike,
} from "./positions";

function tx(
  side: "BUY" | "SELL",
  quantity: string,
  pricePerUnit: string,
  tradedAt: string,
  overrides: Partial<TransactionLike> = {}
): TransactionLike {
  return {
    symbol: "BTC",
    assetType: "CRYPTO",
    currency: "USD",
    side,
    quantity,
    pricePerUnit,
    tradedAt: new Date(`${tradedAt}T00:00:00Z`),
    ...overrides,
  };
}

describe("derivePositions", () => {
  it("tek alışta adet ve maliyeti olduğu gibi alır", () => {
    const [p] = derivePositions([tx("BUY", "2", "100", "2026-01-01")]);
    expect(p.quantity.toString()).toBe("2");
    expect(p.avgCostBasis.toString()).toBe("100");
    expect(p.realizedPL.toString()).toBe("0");
  });

  it("iki alışta ağırlıklı ortalama maliyet hesaplar", () => {
    // 2×100 + 3×200 = 800 toplam maliyet, 5 adet -> 160 ortalama
    const [p] = derivePositions([
      tx("BUY", "2", "100", "2026-01-01"),
      tx("BUY", "3", "200", "2026-02-01"),
    ]);
    expect(p.quantity.toString()).toBe("5");
    expect(p.avgCostBasis.toString()).toBe("160");
  });

  it("satışta ortalama maliyeti DEĞİŞTİRMEZ, adeti düşürür", () => {
    const [p] = derivePositions([
      tx("BUY", "2", "100", "2026-01-01"),
      tx("BUY", "3", "200", "2026-02-01"),
      tx("SELL", "1", "300", "2026-03-01"),
    ]);
    expect(p.quantity.toString()).toBe("4");
    expect(p.avgCostBasis.toString()).toBe("160");
  });

  it("satışta gerçekleşen kâr/zararı biriktirir", () => {
    // ortalama 160, 300'den 2 adet satış -> (300-160)*2 = 280 kâr
    const [p] = derivePositions([
      tx("BUY", "2", "100", "2026-01-01"),
      tx("BUY", "3", "200", "2026-02-01"),
      tx("SELL", "2", "300", "2026-03-01"),
    ]);
    expect(p.realizedPL.toString()).toBe("280");
  });

  it("zararına satışta negatif gerçekleşen kâr/zarar üretir", () => {
    const [p] = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("SELL", "1", "60", "2026-02-01"),
    ]);
    expect(p.realizedPL.toString()).toBe("-40");
    expect(p.quantity.toString()).toBe("0");
  });

  it("tamamen satıldığında ortalama maliyeti sıfırlar", () => {
    const [p] = derivePositions([
      tx("BUY", "2", "100", "2026-01-01"),
      tx("SELL", "2", "150", "2026-02-01"),
    ]);
    expect(p.quantity.toString()).toBe("0");
    expect(p.avgCostBasis.toString()).toBe("0");
  });

  it("elde olandan fazla satışı elde olanla sınırlar (negatife düşmez)", () => {
    const [p] = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("SELL", "5", "200", "2026-02-01"),
    ]);
    expect(p.quantity.toString()).toBe("0");
    // sadece elde olan 1 adet için kâr yazılır: (200-100)*1
    expect(p.realizedPL.toString()).toBe("100");
  });

  it("kesirli adetleri korur (örn. 0.3 ons altın)", () => {
    const [p] = derivePositions([
      tx("BUY", "0.3", "2000", "2026-01-01"),
      tx("BUY", "0.2", "2500", "2026-02-01"),
    ]);
    expect(p.quantity.toString()).toBe("0.5");
    // (0.3*2000 + 0.2*2500) / 0.5 = 1100/0.5 = 2200
    expect(p.avgCostBasis.toString()).toBe("2200");
  });

  it("işlemleri tarih sırasına göre işler (giriş sırası karışık olsa da)", () => {
    const chronological = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("SELL", "1", "300", "2026-03-01"),
    ]);
    const shuffled = derivePositions([
      tx("SELL", "1", "300", "2026-03-01"),
      tx("BUY", "1", "100", "2026-01-01"),
    ]);
    expect(shuffled[0].realizedPL.toString()).toBe(
      chronological[0].realizedPL.toString()
    );
    expect(shuffled[0].realizedPL.toString()).toBe("200");
  });

  it("AYNI GÜN içindeki alış ve satışı doğru sırada işler", () => {
    // Sayfa işlemleri en yeniden eskiye sıralı gönderiyor. Aynı gün içindeki
    // kayıtlarda tradedAt eşit olduğu için sıralama bozulmamalı: alış önce
    // işlenmeli, yoksa satış "elde 0 adet var" diye yok sayılıyordu.
    const buy = tx("BUY", "17.5", "100", "2026-08-11", {
      createdAt: new Date("2026-08-11T10:00:00Z"),
    });
    const sell = tx("SELL", "17.5", "120", "2026-08-11", {
      createdAt: new Date("2026-08-11T11:00:00Z"),
    });

    // dizi en yeniden eskiye (sayfanın gönderdiği sıra)
    const [p] = derivePositions([sell, buy]);

    expect(p.quantity.toString()).toBe("0");
    expect(p.realizedPL.toString()).toBe("350"); // (120-100) * 17.5
  });

  it("aynı gün, aynı saniyede girilmiş kayıtlarda dizi sırasına düşer", () => {
    // createdAt de eşitse elimizde başka ayırt edici yok; en azından
    // çökmemeli ve tutarlı bir sonuç vermeli.
    const buy = tx("BUY", "2", "100", "2026-08-11");
    const sell = tx("SELL", "1", "150", "2026-08-11");
    const [p] = derivePositions([buy, sell]);
    expect(p.quantity.toString()).toBe("1");
    expect(p.realizedPL.toString()).toBe("50");
  });

  it("farklı sembolleri ayrı pozisyon olarak tutar", () => {
    const positions = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("BUY", "2", "50", "2026-01-01", { symbol: "ETH" }),
    ]);
    expect(positions.map((p) => p.symbol)).toEqual(["BTC", "ETH"]);
  });

  it("aynı sembolü farklı para biriminde ayrı pozisyon sayar", () => {
    const positions = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("BUY", "1", "3000", "2026-01-01", { currency: "TRY" }),
    ]);
    expect(positions).toHaveLength(2);
  });
});

describe("openPositions / totalRealizedPL", () => {
  it("tamamen satılmış pozisyonu açık pozisyonlardan çıkarır", () => {
    const positions = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("SELL", "1", "150", "2026-02-01"),
      tx("BUY", "2", "50", "2026-01-01", { symbol: "ETH" }),
    ]);
    expect(openPositions(positions).map((p) => p.symbol)).toEqual(["ETH"]);
  });

  it("tüm pozisyonların gerçekleşen kâr/zararını toplar", () => {
    const positions = derivePositions([
      tx("BUY", "1", "100", "2026-01-01"),
      tx("SELL", "1", "150", "2026-02-01"),
      tx("BUY", "1", "100", "2026-01-01", { symbol: "ETH" }),
      tx("SELL", "1", "80", "2026-02-01", { symbol: "ETH" }),
    ]);
    expect(totalRealizedPL(positions).toString()).toBe("30");
  });
});
