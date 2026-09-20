import { describe, expect, it } from "vitest";

import {
  describeSilence,
  importTokenHealth,
  STALE_AFTER_HOURS,
} from "./tokenHealth";

const now = new Date("2026-09-20T12:00:00Z");
const hoursBefore = (h: number) =>
  new Date(now.getTime() - h * 60 * 60 * 1000);

describe("importTokenHealth", () => {
  it("hiç kullanılmamış anahtarı ayırır", () => {
    // Kurulum yarım kalmış olabilir; "durmuş" demek yanlış olurdu.
    expect(importTokenHealth(null, now)).toEqual({ state: "never" });
  });

  it("yakın zamanda yoklama gelmişse sağlıklı", () => {
    const h = importTokenHealth(hoursBefore(0.2), now);
    expect(h.state).toBe("ok");
  });

  it("eşiğin hemen altı hâlâ sağlıklı", () => {
    // Apps Script koşuları kota baskısında ertelenebiliyor; birkaç
    // atlanan koşu için uyarı vermek yanlış alarm olurdu.
    expect(importTokenHealth(hoursBefore(STALE_AFTER_HOURS - 0.1), now).state).toBe("ok");
  });

  it("eşikte ve üstünde uyarı verir", () => {
    expect(importTokenHealth(hoursBefore(STALE_AFTER_HOURS), now).state).toBe("stale");
    expect(importTokenHealth(hoursBefore(72), now).state).toBe("stale");
  });

  it("sessizlik süresini saat olarak taşır", () => {
    const h = importTokenHealth(hoursBefore(30), now);
    expect(h.state).toBe("stale");
    if (h.state === "stale") expect(Math.round(h.hoursAgo)).toBe(30);
  });

  it("ISO metin damgasını da kabul eder", () => {
    expect(importTokenHealth(hoursBefore(1).toISOString(), now).state).toBe("ok");
  });

  it("ileri tarihli damgada eksi süre üretmez", () => {
    // Sunucu/istemci saat kayması "-3 saat önce" gibi bir metne yol açıyordu.
    const h = importTokenHealth(new Date(now.getTime() + 60_000), now);
    expect(h.state).toBe("ok");
    if (h.state === "ok") expect(h.hoursAgo).toBe(0);
  });

  it("bozuk tarihi kullanılmamış sayar", () => {
    expect(importTokenHealth("bozuk", now)).toEqual({ state: "never" });
  });
});

describe("describeSilence", () => {
  it("bir saatin altını ayrı yazar", () => {
    expect(describeSilence(0.5)).toBe("1 saatten az");
  });

  it("iki güne kadar saat, sonrası gün", () => {
    expect(describeSilence(7)).toBe("7 saat");
    expect(describeSilence(47.9)).toBe("47 saat");
    expect(describeSilence(48)).toBe("2 gün");
    expect(describeSilence(75)).toBe("3 gün");
  });
});
