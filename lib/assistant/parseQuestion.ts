import { toDateKeyUtc } from "@/lib/date/utc";

/**
 * Türkçe bir soruyu, veriyle cevaplanabilir bir sorguya çevirir.
 *
 * API anahtarı YOK, dışarı istek YOK: soru dili dar ve veri zaten elimizde,
 * o yüzden kural tabanlı çözümleme yetiyor. Aynı soru her zaman aynı
 * cevabı veriyor ve her kalıp tek tek test edilebiliyor — bir dil modeli
 * bunların hiçbirini garanti etmezdi.
 *
 * Bedeli açık: tanımadığı bir kalıpta TAHMİN ETMİYOR, `null` dönüyor.
 * Yanlış anlayıp emin bir ses tonuyla yanlış rakam vermek, "anlamadım"
 * demekten çok daha kötü olurdu — kullanıcı sayıyı kontrol etmez.
 */

export type Metric = "expense" | "income" | "net";

export type ParsedQuestion = {
  metric: Metric;
  /** yyyy-MM-dd, dahil. */
  from: string;
  /** yyyy-MM-dd, dahil. */
  to: string;
  /** Kullanıcının sorduğu aralığın okunur adı ("ayın 13'ünden beri"). */
  rangeLabel: string;
  /** Verilmişse yalnızca adı buna benzeyen kategoriler. */
  categoryQuery: string | null;
  /** En büyük kalemi öne çıkar ("en çok nereye harcadım"). */
  wantsTop: boolean;
};

const AYLAR = [
  "ocak",
  "şubat",
  "mart",
  "nisan",
  "mayıs",
  "haziran",
  "temmuz",
  "ağustos",
  "eylül",
  "ekim",
  "kasım",
  "aralık",
];

/** Türkçe küçültme: I/İ ayrımı doğru olsun diye yerel ayarlı. */
function kucult(s: string): string {
  return s.toLocaleLowerCase("tr");
}

/**
 * Soruyu karşılaştırmaya hazırlar: kesme işaretleri ve ekler sayının ya da
 * ay adının peşine yapışıyor ("13'ünden", "Ekim'de"). Noktalama düşürülüp
 * boşluklar sadeleştiriliyor.
 */
function normalize(raw: string): string {
  return kucult(raw)
    .replace(/[’'`´]/g, " ")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function gunEkle(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Ayın son günü (UTC). */
function ayinSonGunu(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Gün numarasını ayın içinde tutar: 31 Şubat yok. Kullanıcı "ayın 31'inden
 * beri" diye sorabiliyor ve şubatta bu tarih mevcut değil.
 */
function gunuKirp(year: number, monthIndex: number, day: number): Date {
  const son = ayinSonGunu(year, monthIndex);
  return new Date(Date.UTC(year, monthIndex, Math.min(Math.max(day, 1), son)));
}

type Aralik = { from: Date; to: Date; label: string };

/**
 * Zaman ifadesini çözer. `now` dışarıdan veriliyor: "bugün" sunucu ile
 * istemcide farklı olmamalı ve testler sabit bir güne bakabilmeli.
 */
function aralikCoz(q: string, now: Date): Aralik | null {
  const bugun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const yil = bugun.getUTCFullYear();
  const ay = bugun.getUTCMonth();

  const ayBasi = new Date(Date.UTC(yil, ay, 1));
  const aySonu = new Date(Date.UTC(yil, ay + 1, 0));

  // --- "ayın 13'ünden beri" / "ayın 13 inden itibaren" ---
  const ayinGunu = q.match(/ay[ıi]n\s+(\d{1,2})\s*\S*\s*(?:beri|itibaren|bu\s*yana)/);
  if (ayinGunu) {
    const gun = Number(ayinGunu[1]);
    /*
     * Gün henüz gelmediyse GEÇEN ayın o günü kastediliyordur: ayın
     * 11'indeyken "ayın 13'ünden beri" denince başlangıç bitişten sonraya
     * düşüyor ve aralık tersine dönüp her zaman boş çıkıyordu.
     */
    let baslangic = gunuKirp(yil, ay, gun);
    let etiketAyi = "";
    if (baslangic > bugun) {
      baslangic = gunuKirp(yil, ay - 1, gun);
      etiketAyi = ` (geçen ay)`;
    }
    return {
      from: baslangic,
      to: bugun,
      label: `ayın ${gun}'inden bugüne${etiketAyi}`,
    };
  }

  // --- "13 ekimden beri" / "13 ekim den itibaren" ---
  const gunAyBeri = q.match(
    new RegExp(`(\\d{1,2})\\s+(${AYLAR.join("|")})\\S*\\s*(?:beri|itibaren|bu\\s*yana)`)
  );
  if (gunAyBeri) {
    const gun = Number(gunAyBeri[1]);
    const ayIndex = AYLAR.indexOf(gunAyBeri[2]);
    // Gelecekte kalıyorsa geçen yılın aynı günü kastediliyordur.
    let aday = gunuKirp(yil, ayIndex, gun);
    if (aday > bugun) aday = gunuKirp(yil - 1, ayIndex, gun);
    return {
      from: aday,
      to: bugun,
      label: `${gun} ${gunAyBeri[2]}'den bugüne`,
    };
  }

  // --- "son 7 gün" / "son 3 ay" / "son 2 hafta" ---
  const son = q.match(/son\s+(\d{1,3})\s*(gün|gun|hafta|ay|yıl|yil)/);
  if (son) {
    const n = Number(son[1]);
    const birim = son[2];
    if (birim.startsWith("g")) {
      return { from: gunEkle(bugun, -(n - 1)), to: bugun, label: `son ${n} gün` };
    }
    if (birim === "hafta") {
      return {
        from: gunEkle(bugun, -(n * 7 - 1)),
        to: bugun,
        label: `son ${n} hafta`,
      };
    }
    if (birim === "ay") {
      // "Son 3 ay" = içinde bulunulan ay dahil 3 ay; arayüzdeki düğmelerle
      // aynı sayma biçimi.
      return {
        from: new Date(Date.UTC(yil, ay - (n - 1), 1)),
        to: aySonu,
        label: `son ${n} ay`,
      };
    }
    return {
      from: new Date(Date.UTC(yil - n + 1, 0, 1)),
      to: aySonu,
      label: `son ${n} yıl`,
    };
  }

  // --- tek kelimelik kalıplar ---
  if (/\bbugün\b|\bbugun\b/.test(q)) {
    return { from: bugun, to: bugun, label: "bugün" };
  }
  if (/\bdün\b|\bdun\b/.test(q)) {
    const d = gunEkle(bugun, -1);
    return { from: d, to: d, label: "dün" };
  }
  if (/\bbu\s*hafta\b/.test(q)) {
    // Hafta pazartesi başlıyor; uygulamanın takvim ızgarası da öyle.
    const gun = (bugun.getUTCDay() + 6) % 7;
    return { from: gunEkle(bugun, -gun), to: bugun, label: "bu hafta" };
  }
  if (/\bgeçen\s*hafta\b|\bgecen\s*hafta\b/.test(q)) {
    const gun = (bugun.getUTCDay() + 6) % 7;
    const buPazartesi = gunEkle(bugun, -gun);
    return {
      from: gunEkle(buPazartesi, -7),
      to: gunEkle(buPazartesi, -1),
      label: "geçen hafta",
    };
  }
  if (/\bgeçen\s*ay\b|\bgecen\s*ay\b/.test(q)) {
    return {
      from: new Date(Date.UTC(yil, ay - 1, 1)),
      to: new Date(Date.UTC(yil, ay, 0)),
      label: "geçen ay",
    };
  }
  if (/\bbu\s*ay\b/.test(q)) {
    return { from: ayBasi, to: aySonu, label: "bu ay" };
  }
  if (/\bgeçen\s*yıl\b|\bgecen\s*yil\b/.test(q)) {
    return {
      from: new Date(Date.UTC(yil - 1, 0, 1)),
      to: new Date(Date.UTC(yil - 1, 11, 31)),
      label: "geçen yıl",
    };
  }
  if (/\bbu\s*yıl\b|\bbu\s*yil\b|\byılbaşından\b|\byilbasindan\b/.test(q)) {
    return {
      from: new Date(Date.UTC(yil, 0, 1)),
      to: aySonu,
      label: "bu yıl",
    };
  }

  // --- "ekimde" / "ekim ayında" / "ekim 2025 te" ---
  // Ay adının SONUNDA sınır aranmıyor: "ağustosta", "aralıkta", "ekimde"
  // gibi ekli hâller sınır koyulduğunda hiç eşleşmiyordu.
  const ayAdi = q.match(
    new RegExp(`\\b(${AYLAR.join("|")})\\w*\\s*(\\d{4})?`)
  );
  if (ayAdi) {
    const ayIndex = AYLAR.indexOf(ayAdi[1]);
    // Yıl yazılmamışsa en yakın GEÇMİŞ o ay: kasımda "ekimde" denince bu
    // yılın ekimi, ocakta "aralıkta" denince geçen yılın aralığı.
    const hedefYil = ayAdi[2]
      ? Number(ayAdi[2])
      : ayIndex <= ay
        ? yil
        : yil - 1;
    return {
      from: new Date(Date.UTC(hedefYil, ayIndex, 1)),
      to: new Date(Date.UTC(hedefYil, ayIndex + 1, 0)),
      label: `${ayAdi[1]} ${hedefYil}`,
    };
  }

  return null;
}

const GIDER_SOZCUKLERI = /harca|gider|ödeme|odeme|masraf|çıkt|cikt/;
const GELIR_SOZCUKLERI = /gelir|kazan|geldi|girdi/;
const NET_SOZCUKLERI = /\bnet\b|kald[ıi]|birik|tasarruf/;

/**
 * Kategori filtresi: "markete ne kadar harcadım" → "market".
 *
 * Yalnızca yönelme/bulunma ekiyle gelen bir sözcük aranıyor; serbest metin
 * aramak "ne kadar" gibi soru sözcüklerini kategori sanmaya yol açardı.
 */
function kategoriCoz(q: string, kategoriler: readonly string[]): string | null {
  for (const ad of kategoriler) {
    const k = kucult(ad);
    // Kategori adı soruda geçiyorsa (ek almış hâli de kabul).
    if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(q)) {
      return ad;
    }
  }
  return null;
}

export function parseQuestion(
  raw: string,
  now: Date,
  kategoriler: readonly string[] = []
): ParsedQuestion | null {
  const q = normalize(raw);
  if (q.length === 0) return null;

  const aralik = aralikCoz(q, now);
  if (!aralik) return null;

  /*
   * Ölçü sırası önemli: "net ne kadar kaldı" hem "net" hem de gider
   * sözcüğü içerebiliyor. Net önce bakılıyor çünkü en belirgin olanı o.
   */
  let metric: Metric;
  if (NET_SOZCUKLERI.test(q)) metric = "net";
  else if (GELIR_SOZCUKLERI.test(q) && !GIDER_SOZCUKLERI.test(q))
    metric = "income";
  else if (GIDER_SOZCUKLERI.test(q)) metric = "expense";
  else return null;

  return {
    metric,
    from: toDateKeyUtc(aralik.from),
    to: toDateKeyUtc(aralik.to),
    rangeLabel: aralik.label,
    categoryQuery: kategoriCoz(q, kategoriler),
    wantsTop: /en\s*(çok|cok|fazla|büyük|buyuk)|nereye|neye/.test(q),
  };
}
