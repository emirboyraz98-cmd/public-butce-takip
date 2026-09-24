import { describe, expect, it } from "vitest";

import { classifyDay, isSunday, toDateKey } from "./holidayCalendar";
import { markDay, markRange } from "./marks.testutil";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/*
 * classifyDay eskiden "çalışma dönemi" aralıklarına bakıp pazar/resmi
 * tatil çözümünü OKUMA anında yapıyordu. Aralık kavramı kaldırıldı ve
 * çözüm işaret YAZILIRKEN yapılıyor (bkz. markDays.test.ts); burada kalan
 * sözleşme çok daha dar: işaretli gün tipini verir, işaretsiz gün maaşa
 * hiç katılmaz.
 */
describe("classifyDay", () => {
  it("işaretsiz gün null döner — maaşa katılmaz", () => {
    expect(classifyDay(d("2026-01-05"), new Map())).toBeNull();
  });

  it("işaret hiç verilmediğinde de null döner", () => {
    expect(classifyDay(d("2026-01-05"))).toBeNull();
  });

  it("işaretli günün tipini verir", () => {
    const marks = markDay("2026-01-05", "NORMAL");
    expect(classifyDay(d("2026-01-05"), marks)).toBe("NORMAL");
  });

  it("başka günlerin işareti o güne sızmaz", () => {
    const marks = markDay("2026-01-05", "LEAVE");
    expect(classifyDay(d("2026-01-06"), marks)).toBeNull();
  });

  it("aralık işaretlendiğinde pazar pazar kalır", () => {
    // 5–11 Ocak 2026 tam bir hafta: içinde tek bir pazar (11 Ocak) var.
    const marks = markRange("2026-01-05", "2026-01-11", "WORKED");
    expect(classifyDay(d("2026-01-11"), marks)).toBe("SUNDAY");
    expect(classifyDay(d("2026-01-06"), marks)).toBe("NORMAL");
  });

  it("aralık izin işaretlenirse pazar da izin olur", () => {
    const marks = markRange("2026-01-05", "2026-01-11", "LEAVE");
    expect(classifyDay(d("2026-01-11"), marks)).toBe("LEAVE");
  });

  it("çalışılan aralıktaki resmi tatil tatil ücretine girer", () => {
    const marks = markRange(
      "2026-01-01",
      "2026-01-03",
      "WORKED",
      new Set(["2026-01-01"])
    );
    expect(classifyDay(d("2026-01-01"), marks)).toBe("PUBLIC_HOLIDAY");
  });

  it("elle konan tip, aralıktan gelen tipi ezer", () => {
    const marks = markRange("2026-01-05", "2026-01-11", "WORKED");
    markDay("2026-01-06", "LEAVE", marks);
    expect(classifyDay(d("2026-01-06"), marks)).toBe("LEAVE");
  });
});

describe("yardımcılar", () => {
  it("pazarı UTC'den tanır", () => {
    expect(isSunday(d("2026-01-11"))).toBe(true);
    expect(isSunday(d("2026-01-12"))).toBe(false);
  });

  it("tarih anahtarını yerel saatten bağımsız üretir", () => {
    expect(toDateKey(d("2026-01-11"))).toBe("2026-01-11");
  });
});
