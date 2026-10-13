/**
 * Sorudaki zaman ifadesini bir tarih aralığına çevirir.
 *
 * Girdi `normalize`dan geçmiş metin: küçük harf, şapkasız, kesme işaretleri
 * boşluk olmuş ("Ekim'de" → "ekim de"). Tüm tarihler UTC gece yarısı; saat
 * dilimi takvimi kaydırmasın diye (bkz. lib/date/utc).
 *
 * Her eşleşme bir de `phrase` üretiyor: cevap cümlesinin başına doğrudan
 * konabilecek, ekleri doğru ifade ("Ekim'de", "13 Eylül'den bu yana",
 * "son 30 günde"). Kullanıcının yazdığını geri okumak yerine anlaşılanı
 * yazmak, yanlış anlaşılmayı ilk bakışta görünür kılıyor.
 */

export type TimeKind =
  | "day"
  | "week"
  | "weekend"
  | "month"
  | "year"
  | "lastN"
  | "since"
  | "range"
  | "all";

export type TimeSpec = {
  /** yyyy-MM-dd, dahil. */
  from: string;
  /** yyyy-MM-dd, dahil. */
  to: string;
  /** Cümle başına konabilecek ifade: "Ekim'de", "dün", "son 30 günde". */
  phrase: string;
  kind: TimeKind;
};

const MS_DAY = 24 * 60 * 60 * 1000;

export const AYLAR = [
  "ocak", "subat", "mart", "nisan", "mayis", "haziran",
  "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
];
const AY_ADI = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
// Ay adlarının bulunma (-de) ve ayrılma (-den) ekleri. Ünlü uyumu ve ünsüz
// benzeşmesi ada göre değiştiği için tablo; kuralla üretmek "Mart'da" gibi
// yanlışlara açık.
const AY_DE = [
  "Ocak'ta", "Şubat'ta", "Mart'ta", "Nisan'da", "Mayıs'ta", "Haziran'da",
  "Temmuz'da", "Ağustos'ta", "Eylül'de", "Ekim'de", "Kasım'da", "Aralık'ta",
];
const AY_DEN = [
  "Ocak'tan", "Şubat'tan", "Mart'tan", "Nisan'dan", "Mayıs'tan",
  "Haziran'dan", "Temmuz'dan", "Ağustos'tan", "Eylül'den", "Ekim'den",
  "Kasım'dan", "Aralık'tan",
];

const SAYI_SOZ: Record<string, number> = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8,
  dokuz: 9, on: 10, onbes: 15, yirmi: 20, otuz: 30, kirk: 40, altmis: 60,
  doksan: 90, yuz: 100,
};

// ---------------------------------------------------------------------------
// Sayıların ekleri: "2025'te", "2024'te", "2020'de". Ek, sayının OKUNUŞUNUN
// son sözcüğüne göre değişiyor; tabloyla seçiliyor.
// ---------------------------------------------------------------------------
const BIRLER = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const ONLAR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];

function sonOkunus(n: number): string {
  if (n % 10 !== 0) return BIRLER[n % 10];
  if (n % 100 !== 0) return ONLAR[Math.floor(n / 10) % 10];
  if (n % 1000 !== 0) return "yüz";
  return "bin";
}

function sayiEki(n: number, tur: "de" | "den"): string {
  const s = sonOkunus(n);
  const unluler = s.match(/[aeıioöuü]/g) ?? ["e"];
  const kalin = /[aıou]/.test(unluler[unluler.length - 1]);
  const sert = /[çfhkpsşt]$/.test(s);
  const d = sert ? "t" : "d";
  const ek = tur === "de" ? `${d}${kalin ? "a" : "e"}` : `${d}${kalin ? "an" : "en"}`;
  return `${n}'${ek}`;
}

// ---------------------------------------------------------------------------
// Tarih yardımcıları (hepsi UTC).
// ---------------------------------------------------------------------------
function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}
function key(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_DAY);
}
function ayinSonGunu(y: number, m: number): number {
  return utc(y, m + 1, 0).getUTCDate();
}
function kirp(y: number, m: number, gun: number): Date {
  const yil = utc(y, m, 1).getUTCFullYear();
  const ay = utc(y, m, 1).getUTCMonth();
  return utc(yil, ay, Math.min(Math.max(gun, 1), ayinSonGunu(yil, ay)));
}
function bugunOf(now: Date): Date {
  return utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
function pazartesi(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

function gunIfadesi(d: Date, simdi: Date): string {
  const yil = d.getUTCFullYear();
  const ay = d.getUTCMonth();
  return yil === simdi.getUTCFullYear()
    ? `${d.getUTCDate()} ${AY_DE[ay]}`
    : `${d.getUTCDate()} ${AY_ADI[ay]} ${sayiEki(yil, "de")}`;
}
function gunden(d: Date, simdi: Date): string {
  const yil = d.getUTCFullYear();
  const ay = d.getUTCMonth();
  return yil === simdi.getUTCFullYear()
    ? `${d.getUTCDate()} ${AY_DEN[ay]}`
    : `${d.getUTCDate()} ${AY_ADI[ay]} ${sayiEki(yil, "den")}`;
}
function gunYalin(d: Date, simdi: Date, ayYaz = true): string {
  const yil = d.getUTCFullYear();
  const ay = ayYaz ? ` ${AY_ADI[d.getUTCMonth()]}` : "";
  return yil === simdi.getUTCFullYear() || !ayYaz
    ? `${d.getUTCDate()}${ay}`
    : `${d.getUTCDate()}${ay} ${yil}`;
}

/**
 * @param adiyla Ay adıyla soruldu ("eylülde"): cevap da adıyla söylesin,
 *   "geçen ay" demesin — kullanıcı neyi sorduğunu cevapta tanısın.
 */
export function monthSpec(y: number, m: number, simdi: Date, adiyla = false): TimeSpec {
  const bas = utc(y, m, 1);
  const yil = bas.getUTCFullYear();
  const ay = bas.getUTCMonth();
  const buAy = yil === simdi.getUTCFullYear() && ay === simdi.getUTCMonth();
  const gecenAy = (() => {
    const g = utc(simdi.getUTCFullYear(), simdi.getUTCMonth() - 1, 1);
    return g.getUTCFullYear() === yil && g.getUTCMonth() === ay;
  })();
  return {
    from: key(bas),
    to: key(utc(yil, ay, ayinSonGunu(yil, ay))),
    phrase: adiyla
      ? yil === simdi.getUTCFullYear()
        ? AY_DE[ay]
        : `${AY_ADI[ay]} ${sayiEki(yil, "de")}`
      : buAy
      ? "bu ay"
      : gecenAy
        ? "geçen ay"
        : yil === simdi.getUTCFullYear()
          ? AY_DE[ay]
          : `${AY_ADI[ay]} ${sayiEki(yil, "de")}`,
    kind: "month",
  };
}

export function yearSpec(y: number, simdi: Date, adiyla = false): TimeSpec {
  const buYil = y === simdi.getUTCFullYear();
  return {
    from: key(utc(y, 0, 1)),
    // İçinde bulunulan yıl, içinde bulunulan ayın sonunda bitiyor: ileri
    // aylardaki tekrarlayan kayıtlar "bu yıl ne harcadım" sorusuna
    // harcanmış gibi girmesin.
    to: buYil
      ? key(utc(y, simdi.getUTCMonth(), ayinSonGunu(y, simdi.getUTCMonth())))
      : key(utc(y, 11, 31)),
    phrase: adiyla
      ? `${y} yılında`
      : buYil
        ? "bu yıl"
        : y === simdi.getUTCFullYear() - 1
          ? "geçen yıl"
          : `${y} yılında`,
    kind: "year",
  };
}

function weekSpec(pzt: Date, phrase: string): TimeSpec {
  return { from: key(pzt), to: key(addDays(pzt, 6)), phrase, kind: "week" };
}

function lastNSpec(n: number, birim: string, simdi: Date): TimeSpec {
  const bugun = bugunOf(simdi);
  if (birim.startsWith("gun")) {
    return { from: key(addDays(bugun, -(n - 1))), to: key(bugun), phrase: `son ${n} günde`, kind: "lastN" };
  }
  if (birim.startsWith("hafta")) {
    return { from: key(addDays(bugun, -(n * 7 - 1))), to: key(bugun), phrase: `son ${n} haftada`, kind: "lastN" };
  }
  if (birim.startsWith("ay")) {
    // İçinde bulunulan ay dahil n ay — arayüzdeki "Son 3 ay" düğmesi gibi.
    const y = simdi.getUTCFullYear();
    const m = simdi.getUTCMonth();
    return {
      from: key(utc(y, m - (n - 1), 1)),
      to: key(utc(y, m, ayinSonGunu(y, m))),
      phrase: `son ${n} ayda`,
      kind: "lastN",
    };
  }
  // "son 1 yılda": son 12 ay (içinde bulunulan dahil), takvim yılı değil.
  const y = simdi.getUTCFullYear();
  const m = simdi.getUTCMonth();
  return {
    from: key(utc(y, m - (12 * n - 1), 1)),
    to: key(utc(y, m, ayinSonGunu(y, m))),
    phrase: `son ${n} yılda`,
    kind: "lastN",
  };
}

// ---------------------------------------------------------------------------
// Eşleştiriciler. Sıra önemli: özelden genele. "13 ekimden 20 ekime kadar"
// önce aralık olarak denenmezse "13 ekim" tek gün sanılırdı.
// ---------------------------------------------------------------------------
const AY = `(${AYLAR.join("|")})`;
/** Ay adından sonra gelebilecek ekler: "ekimde", "ekim de", "ekimden". */
const AY_EK = `[a-z]*(?:\\s(?:nin|nun|in|un|ayinda|ayindaki|ayi|ayindan|ayina|de|da|te|ta|den|dan|ten|tan|e|a|ye|ya|i|u|si|su)\\b)?`;
/** Gün sayısından sonra gelebilecek ekler: "13'ünden" → "13 unden". */
const GUN_EK = `(?:\\s?(?:inci|nci|uncu|ncu|sinden|sindan|sunden|sundan|inden|indan|unden|undan|sinde|sinda|sunde|sunda|inde|inda|unde|unda|sine|sina|sune|suna|ine|ina|une|una|den|dan|ten|tan|de|da|te|ta|si|su|ye|ya|i|u|e|a)\\b)?`;
const BERI = `(?:beri|itibaren|bu\\s?yana|bu\\s?gune\\s?kadar)`;
const SAYI = `(\\d{1,3}|${Object.keys(SAYI_SOZ).join("|")})`;

function sayi(s: string): number {
  return /^\d+$/.test(s) ? Number(s) : (SAYI_SOZ[s] ?? NaN);
}
function ayIndex(s: string): number {
  return AYLAR.indexOf(s);
}
function gecerliGun(n: number): boolean {
  return n >= 1 && n <= 31;
}

/**
 * Yılı yazılmamış bir gün-ay için yıl: bugünden sonraya düşüyorsa geçen
 * yılın aynı günü kastediliyordur ("20 aralıktan beri", ekimde soruluyor).
 */
function enYakinGecmis(gun: number, ay: number, simdi: Date): Date {
  const bugun = bugunOf(simdi);
  const aday = kirp(simdi.getUTCFullYear(), ay, gun);
  return aday > bugun ? kirp(simdi.getUTCFullYear() - 1, ay, gun) : aday;
}

type Eslesme = { re: RegExp; coz: (m: RegExpMatchArray, simdi: Date) => TimeSpec | null };

const ESLESTIRICILER: Eslesme[] = [
  // --- İki uçlu aralıklar -------------------------------------------------
  {
    // "1 eylül - 15 ekim"
    re: new RegExp(`\\b(\\d{1,2})\\s+${AY}[a-z]*\\s*[-–]\\s*(\\d{1,2})\\s+${AY}${AY_EK}`),
    coz: (m, s) => aralik(+m[1], ayIndex(m[2]), +m[3], ayIndex(m[4]), s),
  },
  {
    // "1-15 ekim"
    re: new RegExp(`\\b(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+${AY}${AY_EK}`),
    coz: (m, s) => aralik(+m[1], ayIndex(m[3]), +m[2], ayIndex(m[3]), s),
  },
  {
    // "1 ekimden 10 ekime kadar", "5 eylül ile 3 ekim arası",
    // "ayın 1'inden 15'ine kadar", "1 ile 15 arası"
    re: new RegExp(
      `(?:ayin\\s+)?\\b(\\d{1,2})${GUN_EK}(?:\\s+${AY}${AY_EK})?\\s+(?:ile\\s+|ila\\s+|ve\\s+)?(\\d{1,2})${GUN_EK}(?:\\s+${AY}${AY_EK})?\\s+(?:kadar|arasi[a-z]*|arasinda)`
    ),
    coz: (m, s) => {
      const ay2 = m[4] ? ayIndex(m[4]) : m[2] ? ayIndex(m[2]) : -1;
      const ay1 = m[2] ? ayIndex(m[2]) : ay2;
      if (ay1 === -1) {
        // Ay yazılmamış: içinde bulunulan ay.
        const ay = s.getUTCMonth();
        return aralik(+m[1], ay, +m[3], ay, s);
      }
      return aralik(+m[1], ay1, +m[3], ay2, s);
    },
  },

  {
    // "mart ile nisan arası", "marttan mayısa kadar", "mart - nisan"
    re: new RegExp(`\\b${AY}${AY_EK}\\s+(?:(?:ile|ila|ve|-|–)\\s+)?${AY}${AY_EK}\\s*(?:kadar|arasi[a-z]*|arasinda[a-z]*|$)`),
    coz: (m, s) => {
      const a1 = ayIndex(m[1]);
      const a2 = ayIndex(m[2]);
      const buYil = s.getUTCFullYear();
      // Başlangıç ayı henüz gelmediyse geçen yılın aralığı.
      const y1 = a1 <= s.getUTCMonth() ? buYil : buYil - 1;
      // Bitiş ayı başlangıçtan önce geliyorsa yılı aşan aralık (kasım–ocak).
      const y2 = a2 >= a1 ? y1 : y1 + 1;
      const bas = utc(y1, a1, 1);
      const bit = utc(y2, a2, ayinSonGunu(y2, a2));
      const yilEki = (y: number) => (y === buYil ? "" : ` ${y}`);
      return {
        from: key(bas),
        to: key(bit),
        phrase: `${AY_ADI[a1]}${y1 !== y2 ? yilEki(y1) : ""} – ${AY_ADI[a2]}${yilEki(y2)} arasında`,
        kind: "range",
      };
    },
  },
  {
    // "geçen ayın 15'inden beri"
    re: new RegExp(`\\b(?:gecen|onceki)\\s+ayin\\s+(\\d{1,2})${GUN_EK}\\s*${BERI}`),
    coz: (m, s) => {
      const gun = +m[1];
      if (!gecerliGun(gun)) return null;
      return sinceSpec(kirp(s.getUTCFullYear(), s.getUTCMonth() - 1, gun), s);
    },
  },
  {
    // "geçen ayın 15'inde"
    re: new RegExp(`\\b(?:gecen|onceki)\\s+ayin\\s+(\\d{1,2})${GUN_EK}`),
    coz: (m, s) => {
      const gun = +m[1];
      if (!gecerliGun(gun)) return null;
      const d = kirp(s.getUTCFullYear(), s.getUTCMonth() - 1, gun);
      return { from: key(d), to: key(d), phrase: gunIfadesi(d, s), kind: "day" };
    },
  },

  // --- "son N gün/hafta/ay/yıl" -------------------------------------------
  {
    re: new RegExp(`\\bson\\s+${SAYI}\\s*(gun|hafta|ay|yil|sene)[a-z]*`),
    coz: (m, s) => {
      const n = sayi(m[1]);
      if (!Number.isFinite(n) || n < 1 || n > 400) return null;
      return lastNSpec(n, m[2] === "sene" ? "yil" : m[2], s);
    },
  },
  {
    // "son gün/hafta/ay" — sayısız; tek birim.
    re: /\bson\s+(hafta|ay|yil|sene)\b/,
    coz: (m, s) => lastNSpec(1, m[1] === "sene" ? "yil" : m[1], s),
  },
  {
    re: /\bson\s+zamanlarda\b|\bson\s+gunlerde\b/,
    coz: (_m, s) => ({ ...lastNSpec(30, "gun", s), phrase: "son 30 günde" }),
  },

  // --- "D AY'dan beri" -----------------------------------------------------
  {
    re: new RegExp(`\\b(\\d{1,2})${GUN_EK}\\s+${AY}${AY_EK}\\s*(?:(\\d{4})\\s*[a-z]*\\s*)?${BERI}`),
    coz: (m, s) => {
      const gun = +m[1];
      if (!gecerliGun(gun)) return null;
      const bas = m[3]
        ? kirp(+m[3], ayIndex(m[2]), gun)
        : enYakinGecmis(gun, ayIndex(m[2]), s);
      return sinceSpec(bas, s);
    },
  },
  {
    // "ayın 13'ünden beri", "13'ünden beri"
    re: new RegExp(`(?:\\bayin\\s+)?\\b(\\d{1,2})${GUN_EK}\\s*${BERI}`),
    coz: (m, s) => {
      const gun = +m[1];
      if (!gecerliGun(gun)) return null;
      const bugun = bugunOf(s);
      // Gün henüz gelmediyse geçen ayın o günü kastediliyor.
      let bas = kirp(s.getUTCFullYear(), s.getUTCMonth(), gun);
      if (bas > bugun) bas = kirp(s.getUTCFullYear(), s.getUTCMonth() - 1, gun);
      return sinceSpec(bas, s);
    },
  },
  {
    // "AY'dan beri" — "eylülden beri", "ocaktan beri"
    re: new RegExp(`\\b${AY}${AY_EK}\\s*${BERI}`),
    coz: (m, s) => {
      const ay = ayIndex(m[1]);
      const bas = enYakinGecmis(1, ay, s);
      return sinceSpec(bas, s);
    },
  },
  {
    re: /\b(?:ay|ayin)\s+basindan\s+(?:beri|bu\s?yana|itibaren)\b|\bay\s+basindan\s+bu\s+yana\b/,
    coz: (_m, s) => {
      const bas = utc(s.getUTCFullYear(), s.getUTCMonth(), 1);
      return { ...sinceSpec(bas, s), phrase: "ay başından bu yana" };
    },
  },
  {
    re: /\b(?:yil\s?basindan|yilin\s+basindan|sene\s+basindan|ocaktan)\s+(?:beri|bu\s?yana|itibaren)\b/,
    coz: (_m, s) => {
      const bas = utc(s.getUTCFullYear(), 0, 1);
      return { ...sinceSpec(bas, s), phrase: "yılbaşından bu yana" };
    },
  },
  {
    re: /\byilbasindan\b/,
    coz: (_m, s) => ({ ...sinceSpec(utc(s.getUTCFullYear(), 0, 1), s), phrase: "yılbaşından bu yana" }),
  },

  // --- "N gün/hafta/ay önce" ----------------------------------------------
  {
    re: new RegExp(`\\b${SAYI}\\s+(gun|hafta|ay|yil|sene)\\s+once`),
    coz: (m, s) => {
      const n = sayi(m[1]);
      if (!Number.isFinite(n) || n < 1) return null;
      const bugun = bugunOf(s);
      if (m[2] === "gun") {
        const d = addDays(bugun, -n);
        return { from: key(d), to: key(d), phrase: `${n} gün önce`, kind: "day" };
      }
      if (m[2] === "hafta") {
        return weekSpec(addDays(pazartesi(bugun), -7 * n), `${n} hafta önce`);
      }
      if (m[2] === "ay") {
        const sp = monthSpec(s.getUTCFullYear(), s.getUTCMonth() - n, s);
        return n === 1 ? sp : { ...sp, phrase: `${n} ay önce` };
      }
      return yearSpec(s.getUTCFullYear() - n, s);
    },
  },

  // --- Tek gün: "15 ekimde", "15.10.2026", "ayın 5'inde" ------------------
  {
    re: /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/,
    coz: (m, s) => {
      const gun = +m[1];
      const ay = +m[2] - 1;
      if (!gecerliGun(gun) || ay < 0 || ay > 11) return null;
      let yil = m[3] ? +m[3] : NaN;
      if (Number.isFinite(yil) && yil < 100) yil += 2000;
      const d = Number.isFinite(yil) ? kirp(yil, ay, gun) : enYakinGecmis(gun, ay, s);
      return { from: key(d), to: key(d), phrase: gunIfadesi(d, s), kind: "day" };
    },
  },
  {
    re: new RegExp(`\\b(\\d{1,2})${GUN_EK}\\s+${AY}${AY_EK}(?:\\s+(\\d{4}))?`),
    coz: (m, s) => {
      const gun = +m[1];
      if (!gecerliGun(gun)) return null;
      const ay = ayIndex(m[2]);
      const d = m[3] ? kirp(+m[3], ay, gun) : enYakinGecmis(gun, ay, s);
      return { from: key(d), to: key(d), phrase: gunIfadesi(d, s), kind: "day" };
    },
  },
  {
    re: new RegExp(`\\bayin\\s+(\\d{1,2})${GUN_EK}\\b`),
    coz: (m, s) => {
      const gun = +m[1];
      if (!gecerliGun(gun)) return null;
      const d = kirp(s.getUTCFullYear(), s.getUTCMonth(), gun);
      return { from: key(d), to: key(d), phrase: gunIfadesi(d, s), kind: "day" };
    },
  },

  // --- Göreli günler -------------------------------------------------------
  {
    re: /\b(?:evvelsi\s+gun|onceki\s+gun|dunden\s+onceki\s+gun|evvelki\s+gun)\b/,
    coz: (_m, s) => {
      const d = addDays(bugunOf(s), -2);
      return { from: key(d), to: key(d), phrase: "önceki gün", kind: "day" };
    },
  },
  {
    re: /\bbugun[a-z]*\b(?!\s*(?:e|ye)?\s*kadar)/,
    coz: (_m, s) => {
      const d = bugunOf(s);
      return { from: key(d), to: key(d), phrase: "bugün", kind: "day" };
    },
  },
  {
    re: /\bdun(?:ku|ki|den)?\b/,
    coz: (_m, s) => {
      const d = addDays(bugunOf(s), -1);
      return { from: key(d), to: key(d), phrase: "dün", kind: "day" };
    },
  },

  // --- Hafta sonu ve haftalar ---------------------------------------------
  {
    re: /\b(?:gecen|onceki)\s+hafta\s?sonu[a-z]*/,
    coz: (_m, s) => {
      const cmt = addDays(pazartesi(bugunOf(s)), -2);
      return { from: key(cmt), to: key(addDays(cmt, 1)), phrase: "geçen hafta sonu", kind: "weekend" };
    },
  },
  {
    re: /\b(?:bu\s+)?hafta\s?sonu[a-z]*/,
    coz: (_m, s) => {
      const bugun = bugunOf(s);
      const gun = bugun.getUTCDay(); // 0 pazar, 6 cumartesi
      // Hafta sonundaysak bu hafta sonu; değilse en son GEÇEN hafta sonu
      // — pazartesi sorulan "hafta sonu ne harcadım" geçmişi soruyor.
      const cmt =
        gun === 6 ? bugun : gun === 0 ? addDays(bugun, -1) : addDays(pazartesi(bugun), -2);
      return { from: key(cmt), to: key(addDays(cmt, 1)), phrase: "hafta sonu", kind: "weekend" };
    },
  },
  {
    re: /\b(?:gecen|onceki)\s+hafta[a-z]*/,
    coz: (_m, s) => weekSpec(addDays(pazartesi(bugunOf(s)), -7), "geçen hafta"),
  },
  {
    re: /\bbu\s+hafta[a-z]*/,
    coz: (_m, s) => weekSpec(pazartesi(bugunOf(s)), "bu hafta"),
  },

  // --- Haftanın günleri ----------------------------------------------------
  {
    // Uzun adlar önce: "cumartesi" "cuma" sanılmasın.
    re: /\b(?:(gecen|bu)\s+)?(pazartesi|cumartesi|carsamba|persembe|sali|cuma|pazar)(?:\s+gunu|[a-z]*)?/,
    coz: (m, s) => {
      const ad = m[2];
      // "pazar", "cuma", "sali" başka anlamlara da geliyor ("pazara ne
      // harcadım" = semt pazarı). Yalnızca açıkça gün kastedildiğinde.
      const belirsiz = ad === "pazar" || ad === "cuma" || ad === "sali";
      if (belirsiz && !m[1] && !/gunu/.test(m[0])) return null;
      const hedef = ["pazar", "pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi"].indexOf(ad);
      const bugun = bugunOf(s);
      // "geçen cuma" geçen haftanın cuması; yalın "cuma" en son geçen cuma
      // (bugün cumaysa bugün).
      const d =
        m[1] === "gecen"
          ? addDays(pazartesi(bugun), -7 + ((hedef + 6) % 7))
          : addDays(bugun, -((bugun.getUTCDay() - hedef + 7) % 7));
      const etiket = ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"][hedef];
      return {
        from: key(d),
        to: key(d),
        phrase: m[1] === "gecen" ? `geçen ${etiket}` : `${etiket} günü`,
        kind: "day",
      };
    },
  },

  // --- Gelecek dönemler ---------------------------------------------------
  {
    re: /\b(?:gelecek|onumuzdeki|sonraki|haftaya)\s+hafta[a-z]*|\bhaftaya\b/,
    coz: (_m, s) => weekSpec(addDays(pazartesi(bugunOf(s)), 7), "gelecek hafta"),
  },
  {
    re: /\b(?:gelecek|onumuzdeki|sonraki)\s+ay[a-z]*/,
    coz: (_m, s) => ({ ...monthSpec(s.getUTCFullYear(), s.getUTCMonth() + 1, s), phrase: "gelecek ay" }),
  },
  {
    re: /\b(?:gelecek|onumuzdeki|sonraki)\s+(?:yil|sene)[a-z]*|\bseneye\b/,
    coz: (_m, s) => ({ ...yearSpec(s.getUTCFullYear() + 1, s), phrase: "gelecek yıl" }),
  },
  {
    re: /\bay\s+sonuna\s+(?:kadar|dek)\b/,
    coz: (_m, s) => {
      const y = s.getUTCFullYear();
      const m = s.getUTCMonth();
      return {
        from: key(bugunOf(s)),
        to: key(utc(y, m, ayinSonGunu(y, m))),
        phrase: "ay sonuna kadar",
        kind: "range",
      };
    },
  },

  // --- Aylar ---------------------------------------------------------------
  {
    re: /\b(?:evvelki|ondan\s+onceki)\s+ay[a-z]*/,
    coz: (_m, s) => monthSpec(s.getUTCFullYear(), s.getUTCMonth() - 2, s),
  },
  {
    re: /\b(?:gecen|onceki)\s+ay[a-z]*/,
    coz: (_m, s) => monthSpec(s.getUTCFullYear(), s.getUTCMonth() - 1, s),
  },
  {
    re: /\bbu\s+ay[a-z]*|\bsu\s+anki\s+ay|\bicinde\s+bulundugum\s+ay/,
    coz: (_m, s) => monthSpec(s.getUTCFullYear(), s.getUTCMonth(), s),
  },
  {
    // "geçen yıl ekimde", "geçen sene mart"
    re: new RegExp(`\\b(?:gecen|onceki)\\s+(?:yil|sene)[a-z]*\\s+${AY}${AY_EK}`),
    coz: (m, s) => monthSpec(s.getUTCFullYear() - 1, ayIndex(m[1]), s, true),
  },
  {
    // "geçen ekim": içinde bulunulan aydan ÖNCEKİ en yakın ekim
    re: new RegExp(`\\bgecen\\s+${AY}${AY_EK}`),
    coz: (m, s) => {
      const ay = ayIndex(m[1]);
      const yil = ay < s.getUTCMonth() ? s.getUTCFullYear() : s.getUTCFullYear() - 1;
      return monthSpec(yil, ay, s, true);
    },
  },
  {
    // "ekimde", "ekim 2025", "ekim ayında"
    re: new RegExp(`\\b${AY}${AY_EK}(?:\\s+(\\d{4}))?`),
    coz: (m, s) => {
      const ay = ayIndex(m[1]);
      if (m[2]) return monthSpec(+m[2], ay, s, true);
      // Yıl yazılmamışsa en yakın geçmiş ya da içinde bulunulan o ay.
      const yil = ay <= s.getUTCMonth() ? s.getUTCFullYear() : s.getUTCFullYear() - 1;
      return monthSpec(yil, ay, s, true);
    },
  },

  // --- Yıllar --------------------------------------------------------------
  {
    re: /\b(?:gecen|onceki)\s+(?:yil|sene)[a-z]*/,
    coz: (_m, s) => yearSpec(s.getUTCFullYear() - 1, s),
  },
  {
    re: /\bbu\s+(?:yil|sene)[a-z]*/,
    coz: (_m, s) => yearSpec(s.getUTCFullYear(), s),
  },
  {
    re: /\b(20\d{2})(?:\s*(?:yili[a-z]*|yilinda|senesinde|de|da|te|ta|e|a))?\b/,
    coz: (m, s) => yearSpec(+m[1], s, true),
  },

  // --- Bütün zamanlar ------------------------------------------------------
  {
    re: /\b(?:simdiye|bugune|su\s?ana)\s+(?:kadar|dek)\b|\btum\s+zaman[a-z]*|\bbutun\s+zaman[a-z]*|\btoplamda\b|\bbaslangictan\s+beri\b|\bhep(?:si|sinde|sini)\b|\btum\s+kayit[a-z]*|\bbutun\s+kayit[a-z]*|\bgecmisten\s+bu\s?yana\b|\bomrum\s+boyunca\b|\bsimdiye\s+dek\b/,
    coz: () => ALL_TIME,
  },
];

/** Bütün zamanlar; uçları çağıran veriden dolduruyor. */
const ALL_TIME: TimeSpec = { from: "0000-01-01", to: "9999-12-31", phrase: "şimdiye kadar", kind: "all" };

function aralik(g1: number, a1: number, g2: number, a2: number, s: Date): TimeSpec | null {
  if (!gecerliGun(g1) || !gecerliGun(g2) || a1 < 0 || a2 < 0) return null;
  let bas = enYakinGecmis(g1, a1, s);
  let bit = kirp(bas.getUTCFullYear() + (a2 < a1 ? 1 : 0), a2, g2);
  // Bitiş başlangıçtan önceyse (yıl dönümünü aşan aralık) bir yıl ileri.
  if (bit < bas) bit = kirp(bit.getUTCFullYear() + 1, a2, g2);
  // Aralığın tamamı gelecekteyse bir yıl geri: "20-25 aralık" ekimde
  // sorulduysa geçen yılın aralığı.
  if (bas > bugunOf(s)) {
    bas = kirp(bas.getUTCFullYear() - 1, a1, g1);
    bit = kirp(bit.getUTCFullYear() - 1, a2, g2);
  }
  const ayniAy =
    bas.getUTCMonth() === bit.getUTCMonth() && bas.getUTCFullYear() === bit.getUTCFullYear();
  const phrase = ayniAy
    ? `${bas.getUTCDate()}–${gunYalin(bit, s)} arasında`
    : `${gunYalin(bas, s)} – ${gunYalin(bit, s)} arasında`;
  return { from: key(bas), to: key(bit), phrase, kind: "range" };
}

function sinceSpec(bas: Date, s: Date): TimeSpec {
  return { from: key(bas), to: key(bugunOf(s)), phrase: `${gunden(bas, s)} bu yana`, kind: "since" };
}

export type ParsedTime = {
  spec: TimeSpec;
  /** Zaman ifadesi çıkarılmış metin. */
  rest: string;
  /** İfadeden hemen sonra gelen metin ("geçen aya göre" → "gore ..."). */
  after: string;
};

/**
 * Metindeki ilk (en özgül) zaman ifadesini bulur; eşleşen kısım `rest`ten
 * çıkarılıyor ki "mart" gibi ay adları kategori ya da not araması sanılmasın.
 */
export function parseTime(text: string, now: Date): ParsedTime | null {
  for (const { re, coz } of ESLESTIRICILER) {
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    const spec = coz(m, now);
    if (!spec) continue;
    const after = text.slice(m.index + m[0].length).trim();
    const rest = `${text.slice(0, m.index)} ${after}`.replace(/\s+/g, " ").trim();
    return { spec, rest, after };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Zaman söylenmediğinde ve karşılaştırmada kullanılan aralıklar.
// ---------------------------------------------------------------------------
export function thisMonth(now: Date): TimeSpec {
  return monthSpec(now.getUTCFullYear(), now.getUTCMonth(), now);
}

/** İçinde bulunulan ay HARİÇ son n tam ay: ortalama, yarım ayla bozulmasın. */
export function lastCompleteMonths(n: number, now: Date): TimeSpec {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const bas = utc(y, m - n, 1);
  const bit = utc(y, m, 0);
  return {
    from: key(bas),
    to: key(bit),
    phrase: n === 1 ? "geçen ay" : `son ${n} tam ayda`,
    kind: "lastN",
  };
}

export function last12Months(now: Date): TimeSpec {
  return { ...lastNSpec(12, "ay", now), phrase: "son 12 ayda" };
}

export { ALL_TIME };

/**
 * Karşılaştırma için bir önceki EŞDEĞER dönem: ay → önceki ay, hafta →
 * önceki hafta, "son 30 gün" → ondan önceki 30 gün.
 */
export function previousPeriod(spec: TimeSpec, now: Date): TimeSpec {
  const from = new Date(`${spec.from}T00:00:00Z`);
  const to = new Date(`${spec.to}T00:00:00Z`);
  if (spec.kind === "month") {
    return monthSpec(from.getUTCFullYear(), from.getUTCMonth() - 1, now);
  }
  if (spec.kind === "year") {
    const y = from.getUTCFullYear() - 1;
    return { from: key(utc(y, 0, 1)), to: key(utc(y, 11, 31)), phrase: y === now.getUTCFullYear() - 1 ? "geçen yıl" : `${y} yılında`, kind: "year" };
  }
  if (spec.kind === "week") {
    return weekSpec(addDays(from, -7), "önceki hafta");
  }
  if (spec.kind === "day") {
    const d = addDays(from, -1);
    return { from: key(d), to: key(d), phrase: "bir önceki gün", kind: "day" };
  }
  const gun = Math.round((to.getTime() - from.getTime()) / MS_DAY) + 1;
  const bit = addDays(from, -1);
  const bas = addDays(bit, -(gun - 1));
  return { from: key(bas), to: key(bit), phrase: `önceki ${gun} günde`, kind: "range" };
}

// ---------------------------------------------------------------------------
// Cevap cümlelerinde kullanılan ifadeler.
// ---------------------------------------------------------------------------

/** "2026-10-12" → "12 Ekim'de" (başka yıldaysa "12 Ekim 2025'te"). */
export function dayPhrase(dateKey: string, now: Date): string {
  return gunIfadesi(new Date(`${dateKey}T00:00:00Z`), now);
}

/** "2026-08" → "Ağustos'ta" (başka yıldaysa "Ağustos 2025'te"). */
export function monthPhrase(monthKey: string, now: Date): string {
  const [y, m] = monthKey.split("-").map(Number);
  return y === now.getUTCFullYear() ? AY_DE[m - 1] : `${AY_ADI[m - 1]} ${sayiEki(y, "de")}`;
}

/** "2026-08" → "Ağustos" (başka yıldaysa "Ağustos 2025"). */
export function monthName(monthKey: string, now: Date): string {
  const [y, m] = monthKey.split("-").map(Number);
  return y === now.getUTCFullYear() ? AY_ADI[m - 1] : `${AY_ADI[m - 1]} ${y}`;
}

/** Aralığın kısa, eksiz okunuşu: "1–31 Ekim 2026", "13 Eylül – 13 Ekim 2026". */
export function rangeLabel(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (from === to) return `${b.getUTCDate()} ${AY_ADI[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  const ayniYil = a.getUTCFullYear() === b.getUTCFullYear();
  const ayniAy = ayniYil && a.getUTCMonth() === b.getUTCMonth();
  if (ayniAy) return `${a.getUTCDate()}–${b.getUTCDate()} ${AY_ADI[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  const bas = ayniYil
    ? `${a.getUTCDate()} ${AY_ADI[a.getUTCMonth()]}`
    : `${a.getUTCDate()} ${AY_ADI[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  return `${bas} – ${b.getUTCDate()} ${AY_ADI[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** Hafta: pazartesiden pazara, `ref` gününü içeren hafta. */
export function weekOf(ref: Date, phrase: string): TimeSpec {
  return weekSpec(pazartesi(bugunOf(ref)), phrase);
}

export function todaySpec(now: Date): TimeSpec {
  const d = bugunOf(now);
  return { from: key(d), to: key(d), phrase: "bugün", kind: "day" };
}

export function todayKey(now: Date): string {
  return key(bugunOf(now));
}

export function addDaysKey(dateKey: string, n: number): string {
  return key(addDays(new Date(`${dateKey}T00:00:00Z`), n));
}

export function daysBetween(from: string, to: string): number {
  return (
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / MS_DAY
    ) + 1
  );
}

/**
 * Gelecek zaman kipindeki soruda ("kasımda ne harcayacağım") yılı
 * yazılmamış ay geçmişe değil, önümüzdeki o aya düşmeli.
 */
export function towardsFuture(spec: TimeSpec, now: Date): TimeSpec {
  if (spec.kind !== "month" || spec.to >= todayKey(now)) return spec;
  const d = new Date(`${spec.from}T00:00:00Z`);
  return monthSpec(d.getUTCFullYear() + 1, d.getUTCMonth(), now, true);
}

const AY_IN = [
  "Ocak'ın", "Şubat'ın", "Mart'ın", "Nisan'ın", "Mayıs'ın", "Haziran'ın",
  "Temmuz'un", "Ağustos'un", "Eylül'ün", "Ekim'in", "Kasım'ın", "Aralık'ın",
];

/**
 * Dönemin tamlayan hâli: "geçen ay" → "geçen ayın", "Eylül'de" →
 * "Eylül'ün". Karşılaştırma cümlesi ("geçen ayın aynı günlerinde")
 * için; tanınmayan ifadede "önceki dönemin".
 */
export function genitive(spec: TimeSpec): string {
  const p = spec.phrase;
  if (/ ay$/.test(p)) return `${p}ın`;
  if (/ hafta$/.test(p)) return `${p}nın`;
  if (/ yıl$/.test(p)) return `${p}ın`;
  const yil = p.match(/^(\d{4}) yılında$/);
  if (yil) return `${yil[1]} yılının`;
  const ay = AY_DE.indexOf(p);
  if (ay >= 0) return AY_IN[ay];
  const ayYil = p.match(/^(\S+) (\d{4})'/);
  if (ayYil && AY_ADI.includes(ayYil[1])) return `${ayYil[1]} ${ayYil[2]} ayının`;
  return "önceki dönemin";
}

/** "2026-01-01" → "1 Ocak'tan" (başka yıldaysa "1 Ocak 2025'ten"). */
export function dayFromPhrase(dateKey: string, now: Date): string {
  return gunden(new Date(`${dateKey}T00:00:00Z`), now);
}
