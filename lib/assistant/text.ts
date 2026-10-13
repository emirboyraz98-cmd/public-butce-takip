/**
 * Soru kutusunun Türkçe metin katmanı.
 *
 * İki sorunu çözüyor:
 *
 * 1. Şapkasız yazım. Telefonda çoğu kişi "ulasima ne kadar harcadim" yazıyor;
 *    karşılaştırma ç/ğ/ı/ö/ş/ü harflerini düz harflere katlanmış metinde
 *    yapılıyor, böylece iki yazım da aynı şeye eşleşiyor.
 *
 * 2. Ekler. "markete", "yemeğe", "faturalara", "kiraya" sözcükleri kategori
 *    adının kendisi değil; ek soyulmadan "Market", "Yeme-İçme", "Faturalar",
 *    "Kira" ile eşleşmiyorlardı. `stems` bir sözcüğün olası köklerini üretiyor.
 */

const KATLAMA: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/**
 * Türkçe küçültme + şapka katlama.
 *
 * Önce `tr` yerel ayarıyla küçültülüyor: "I" → "ı", "İ" → "i". Yerel ayarsız
 * küçültme "KİRA"yı "ki̇ra" (noktalı birleşik karakterle) yapıp eşleşmeyi
 * bozuyordu.
 */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFC")
    .replace(/[çğıiöşüâîû]/g, (h) => KATLAMA[h] ?? h)
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Soruyu sözcüklere ayırır: kesme işareti ekleri sözcükten ayırıyor
 * ("Ekim'de" → "ekim de") — ek ayrı kalınca kök kendiliğinden ortaya
 * çıkıyor. Sayılar ve tarih ayraçları korunuyor.
 */
export function normalize(raw: string): string {
  return fold(raw)
    .replace(/[’'`´]/g, " ")
    .replace(/[?!,;:"“”()]/g, " ")
    .replace(/(\d)\.(\d)/g, "$1§$2") // 13.10.2026 tarih ayracını koru
    .replace(/\./g, " ")
    .replace(/§/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(normalized: string): string[] {
  return normalized.split(/[\s\-–—/]+/).filter(Boolean);
}

/*
 * Katlanmış metinde ekler. Uzundan kısaya sıralı: önce "lerden" denenip
 * ardından "den" denensin ki "faturalardan" → "fatura" olsun.
 *
 * Katlama ı/i, ü/u ayrımını sildiği için ünlü uyumunun iki biçimi aynı
 * yazıya düşüyor; listeyi kısaltan da bu.
 */
const EKLER = [
  "lerinden", "larindan", "lerinde", "larinda", "lerine", "larina",
  "lerden", "lardan", "lerde", "larda", "lerin", "larin", "leri", "lari",
  "lere", "lara", "ler", "lar",
  "imizden", "umuzdan", "imize", "umuza", "imiz", "umuz",
  "indan", "inden", "undan", "unden", "ndan", "nden",
  "inda", "inde", "unda", "unde", "nda", "nde",
  "ina", "ine", "una", "une",
  "yla", "yle", "ile", "ila",
  "dan", "den", "tan", "ten",
  "nin", "nun", "yi", "yu", "ya", "ye",
  "da", "de", "ta", "te",
  "la", "le",
  "im", "um", "in", "un", "si", "su",
  "a", "e", "i", "u",
];

/** Ünsüz yumuşamasının tersi: "yemeğ" → "yemek", "kitab" → "kitap". */
const SERTLESME: Record<string, string> = { g: "k", b: "p", d: "t", c: "c" };

/**
 * Bir sözcüğün olası kökleri, sözcüğün kendisi dahil.
 *
 * Ekler en fazla üç kez soyuluyor ("faturalarimizdan" → "faturalarimiz" →
 * "faturalar" → "fatura"). Üç harften kısa kök üretilmiyor: "kira"dan
 * "kir" üretmek yetiyor, "ki" her şeye eşleşirdi.
 */
export function stems(word: string): Set<string> {
  const out = new Set<string>([word]);
  let sinir = [word];

  for (let tur = 0; tur < 3; tur++) {
    const sonraki: string[] = [];
    for (const w of sinir) {
      for (const ek of EKLER) {
        if (!w.endsWith(ek)) continue;
        const kok = w.slice(0, -ek.length);
        if (kok.length < 3) continue;
        if (!out.has(kok)) {
          out.add(kok);
          sonraki.push(kok);
        }
        const son = kok.at(-1)!;
        if (SERTLESME[son]) {
          const sert = kok.slice(0, -1) + SERTLESME[son];
          if (!out.has(sert)) {
            out.add(sert);
            sonraki.push(sert);
          }
        }
      }
    }
    if (sonraki.length === 0) break;
    sinir = sonraki;
  }
  return out;
}

/**
 * Sorudaki bir sözcük, bir addaki sözcükle (kategori ya da not) aynı şeyi mi
 * söylüyor?
 *
 * İki yoldan eşleşiyor: kökler kesişiyorsa ("faturalara" ↔ "faturalar",
 * ikisinin de kökü "fatura") ya da sorudaki sözcük adla başlıyorsa
 * ("ulasima" ↔ "ulasim"). İkinci yol en az dört harfli adlarla sınırlı;
 * "ev" adlı bir kategori "evvelsi"ye eşleşmesin.
 */
export function wordMatches(queryWord: string, nameWord: string): boolean {
  if (queryWord === nameWord) return true;
  if (nameWord.length >= 4 && queryWord.startsWith(nameWord)) return true;

  const a = stems(queryWord);
  const b = stems(nameWord);
  for (const kok of a) {
    // Ortak kök en az dört harf olmalı ya da adın tamamına eşit olmalı:
    // "kir" gibi üç harfli kökler tek başına eşleşme sebebi değil.
    if (b.has(kok) && (kok.length >= 4 || kok === nameWord)) return true;
  }
  return false;
}
