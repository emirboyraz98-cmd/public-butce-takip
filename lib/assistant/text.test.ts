import { describe, expect, it } from "vitest";

import { fold, normalize, stems, tokens, wordMatches } from "./text";

describe("fold", () => {
  it("şapkaları ve Türkçe harfleri düzleştirir", () => {
    expect(fold("Ulaşım")).toBe("ulasim");
    expect(fold("Yeme-İçme")).toBe("yeme-icme");
    expect(fold("ÖDEDİM")).toBe("odedim");
    expect(fold("Iğdır")).toBe("igdir");
  });

  it("şapkalı ve şapkasız yazım aynı yere düşer", () => {
    expect(fold("harcadım")).toBe(fold("harcadim"));
    expect(fold("geçen ay")).toBe(fold("gecen ay"));
  });
});

describe("normalize", () => {
  it("kesme işaretini ekten ayırır", () => {
    expect(normalize("Ekim'de")).toBe("ekim de");
    expect(normalize("ayın 13'ünden")).toBe("ayin 13 unden");
  });

  it("noktalı tarihi korur, cümle noktasını atar", () => {
    expect(normalize("13.10.2026 ne harcadım.")).toBe("13.10.2026 ne harcadim");
  });

  it("tokens tire ve eğik çizgide de böler", () => {
    expect(tokens(normalize("1-15 ekim"))).toEqual(["1", "15", "ekim"]);
  });
});

describe("stems", () => {
  it.each([
    ["markete", "market"],
    ["kiraya", "kira"],
    ["faturalara", "fatura"],
    ["faturalardan", "fatura"],
    ["ulasima", "ulasim"],
    ["yemege", "yemek"], // ğ yumuşaması geri alınır
    ["kartla", "kart"],
    ["eglenceye", "eglence"],
  ])("%s → %s içerir", (word, kok) => {
    expect(stems(word).has(kok)).toBe(true);
  });

  it("üç harften kısa kök üretmez", () => {
    for (const k of stems("ana")) expect(k.length).toBeGreaterThanOrEqual(3);
  });
});

describe("wordMatches", () => {
  it.each([
    ["markete", "market"],
    ["marketten", "market"],
    ["kiraya", "kira"],
    ["faturalara", "faturalar"],
    ["faturaya", "faturalar"],
    ["ulasima", "ulasim"],
    ["yemege", "yeme"],
    ["yemek", "yeme"],
    ["eglenceye", "eglence"],
  ])("%s ↔ %s eşleşir", (q, n) => {
    expect(wordMatches(q, n)).toBe(true);
  });

  it.each([
    ["kirli", "kira"],
    ["evvelsi", "ev"],
    ["markalar", "market"],
    ["ne", "netflix"],
  ])("%s ↔ %s eşleşmez", (q, n) => {
    expect(wordMatches(q, n)).toBe(false);
  });
});
