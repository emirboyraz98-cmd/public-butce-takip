import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultRange,
  forgetRange,
  parseRange,
  rememberRange,
  serializeRange,
} from "./rangePreference";

/** `document.cookie` yazımlarını yakalayan sahte belge. */
function stubDocument() {
  const writes: string[] = [];
  vi.stubGlobal("document", {
    set cookie(value: string) {
      writes.push(value);
    },
  });
  return writes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("serializeRange / parseRange", () => {
  it("yazılan aralığı geri okur", () => {
    const range = { from: "2026-03", to: "2026-08" };
    expect(parseRange(serializeRange(range))).toEqual(range);
  });

  it("çerez yoksa null döner", () => {
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange("")).toBeNull();
  });
});

describe("parseRange — geçersiz içerik", () => {
  // Çerez kullanıcı tarafından değiştirilebilir; hiçbirine güvenilmemeli.
  it("bozuk biçimi reddeder", () => {
    expect(parseRange("2026-03")).toBeNull();
    expect(parseRange("saçma")).toBeNull();
    expect(parseRange("_")).toBeNull();
  });

  it("geçersiz ayı reddeder", () => {
    expect(parseRange("2026-13_2026-08")).toBeNull();
    expect(parseRange("2026-00_2026-08")).toBeNull();
    expect(parseRange("2026-3_2026-08")).toBeNull();
  });

  it("makul olmayan yılı reddeder", () => {
    expect(parseRange("1899-03_1899-08")).toBeNull();
    expect(parseRange("2999-03_2999-08")).toBeNull();
  });

  it("başlangıcı bitişten sonra olan aralığı reddeder", () => {
    expect(parseRange("2026-08_2026-03")).toBeNull();
  });

  it("tek aylık aralığı kabul eder", () => {
    expect(parseRange("2026-05_2026-05")).toEqual({
      from: "2026-05",
      to: "2026-05",
    });
  });

  it("gelecek aya uzanan aralığı kabul eder (projeksiyon)", () => {
    expect(parseRange("2026-06_2027-06")).toEqual({
      from: "2026-06",
      to: "2027-06",
    });
  });
});

describe("defaultRange — takvimle birlikte kayar", () => {
  it("ağustosta mart–ağustos verir", () => {
    expect(defaultRange(new Date("2026-08-11T12:00:00"))).toEqual({
      from: "2026-03",
      to: "2026-08",
    });
  });

  it("kasımda haziran–kasım verir (pencere sabitlenmez)", () => {
    // Kullanıcının sorduğu senaryo: aylar ilerleyince aralık da ilerlemeli.
    expect(defaultRange(new Date("2026-11-02T12:00:00"))).toEqual({
      from: "2026-06",
      to: "2026-11",
    });
  });

  it("yıl başında bir önceki yıla taşar", () => {
    expect(defaultRange(new Date("2026-01-15T12:00:00"))).toEqual({
      from: "2025-08",
      to: "2026-01",
    });
  });

  it("ayın son gününde de aynı ayı verir", () => {
    // Yerel saatte ay sonu, UTC'ye çevrilince sonraki aya kaymamalı.
    expect(defaultRange(new Date("2026-03-31T23:30:00"))).toEqual({
      from: "2025-10",
      to: "2026-03",
    });
  });

  it("her zaman 6 aylık pencere üretir", () => {
    for (let m = 0; m < 12; m++) {
      const { from, to } = defaultRange(new Date(2026, m, 15));
      const months =
        (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
        (Number(to.slice(5)) - Number(from.slice(5)));
      expect(months).toBe(5); // 5 ay fark = 6 ay dahil
    }
  });
});

describe("rememberRange — oturum kapsamı", () => {
  // Saklama bilerek oturumla sınırlı. Çereze bir ömür verilirse seçim
  // bayatlar: ağustosta seçilen mart–ağustos kasımda da açılır ve son üç ay
  // grafikte hiç görünmez. Aşağıdaki testler bunu engeller.
  it("çereze son kullanma tarihi koymaz", () => {
    const writes = stubDocument();
    rememberRange({ from: "2026-03", to: "2026-08" });

    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toMatch(/max-age/i);
    expect(writes[0]).not.toMatch(/expires/i);
  });

  it("yazdığı çerez okunduğunda aynı aralığı verir", () => {
    const writes = stubDocument();
    const range = { from: "2026-01", to: "2027-02" };
    rememberRange(range);

    const value = writes[0].split(";")[0].split("=")[1];
    expect(parseRange(value)).toEqual(range);
  });

  it("çerezi site geneline ve samesite=lax olarak yazar", () => {
    const writes = stubDocument();
    rememberRange({ from: "2026-03", to: "2026-08" });

    expect(writes[0]).toContain("path=/");
    expect(writes[0]).toContain("samesite=lax");
  });
});

describe("forgetRange", () => {
  it("çerezi hemen sona erdirir", () => {
    const writes = stubDocument();
    forgetRange();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("max-age=0");
    expect(writes[0]).toContain("path=/");
  });

  it("sildiği çerezin değeri boştur ve varsayılana düşer", () => {
    const writes = stubDocument();
    forgetRange();

    const value = writes[0].split(";")[0].split("=")[1];
    expect(parseRange(value)).toBeNull();
  });
});

describe("sunucuda (document yokken) çökmez", () => {
  it("rememberRange/forgetRange sessizce geçer", () => {
    vi.stubGlobal("document", undefined);
    expect(() => rememberRange({ from: "2026-03", to: "2026-08" })).not.toThrow();
    expect(() => forgetRange()).not.toThrow();
  });
});
