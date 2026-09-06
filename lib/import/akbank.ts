/**
 * Akbank harcama bildirim maillerinin ayrıştırılması.
 *
 * Banka, her kart hareketi için sabit kalıplı bir mail atıyor. Kalıp
 * içinde tutar, para birimi, kartın son dört hanesi, taksit sayısı ve
 * HARCAMA SEKTÖRÜ (YEMEK, BENZIN ISTASYONU, GIDA VE MARKET...) var.
 * Sektör, uygulamadaki kategoriye eşlenebildiği için kayıtlar
 * kategorisiz düşmüyor.
 *
 * Mailde OLMAYAN tek şey işyeri adı: "Migros" değil "GIDA VE MARKET"
 * yazıyor. Bu yüzden içe aktarılan kaydın notu sektörden türetilir.
 *
 * Ayrıştırma bilerek TOLERANSLI: banka metni zaman zaman bozuk
 * gönderiyor (iptal mailinde "kartınızla tutarındaki" gibi çift kelime),
 * ve kalıp haber verilmeden değişebilir. Eşleşmeyen mail sessizce
 * atlanmaz, `reason` ile geri döner — böylece kaçan harcama görünür olur.
 */

/** Uygulamanın desteklediği para birimleri dışındaki tutarlar da okunur;
 * çeviri kararı çağırana bırakılır. */
export type AkbankTransactionKind = "PURCHASE" | "CANCELLATION";

export type AkbankParsedTransaction = {
  kind: AkbankTransactionKind;
  /** Kartın son dört hanesi — birden fazla kart varsa ayırt eder. */
  cardLast4: string;
  /** "Axess Asıl", "Axess Sanal"... */
  cardName: string;
  cardHolder: string;
  /** Ondalık nokta ile normalize edilmiş tutar: "1900.00". */
  amount: string;
  /** ISO kodu; mailde "TL" yazan "TRY"ye çevrilir. */
  currency: string;
  /** Banka sektör adı, mailde geçtiği hâliyle: "GIDA VE MARKET". */
  sector: string;
  /** 1 = tek çekim. */
  installmentCount: number;
  contactless: boolean;
  /** Konu satırı "Yurt Dışı" ile başlıyorsa true. */
  abroad: boolean;
  /** Kalan limit (TL). Doğrulama dışında kullanılmıyor. */
  remainingLimit: string | null;
};

export type AkbankParseResult =
  | { ok: true; transaction: AkbankParsedTransaction }
  | { ok: false; reason: string };

/**
 * Bankanın gönderdiği adres. Aynı kalıbı taklit eden bir mail içeri
 * kayıt açamasın diye eşleşme bu adrese bağlanır; Gmail etiketi
 * kullanıcı tarafından elle de verilebildiği için tek başına yeterli
 * bir güvence değil.
 */
export const AKBANK_SENDER = "hizmet@bilgi.akbank.com";

/**
 * Tutar ayrıştırma.
 *
 * Akbank mailleri "1,900.00" (İngilizce) yazıyor ama bu bir tercih,
 * garanti değil — Türkçe "1.900,00" biçimi her an gelebilir. İkisini de
 * doğru okumak için ayraçların KONUMUNA bakılır, sabit bir biçim
 * varsayılmaz:
 *   - iki ayraç da varsa, SONDAKİ ondalık ayracıdır
 *   - tek ayraç varsa ve ardından tam 3 hane geliyorsa binlik ayracıdır
 *     ("1,900"), aksi hâlde ondalık ("230.00")
 */
export function parseAkbankAmount(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d[\d.,]*$/.test(text)) return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");

  let decimalSep: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const pos = lastDot >= 0 ? lastDot : lastComma;
    const tail = text.slice(pos + 1);
    // Tek ayraç + tam 3 hane = binlik. "1.900" ile "1.900,00" arasındaki
    // fark yalnızca budur; yanlış okuma tutarı 1000 kat şaşırtır.
    decimalSep = tail.length === 3 && !tail.includes(".") && !tail.includes(",")
      ? null
      : sep;
  }

  const intPart =
    decimalSep === null
      ? text.replace(/[.,]/g, "")
      : text.slice(0, text.lastIndexOf(decimalSep)).replace(/[.,]/g, "");
  const fracPart =
    decimalSep === null ? "" : text.slice(text.lastIndexOf(decimalSep) + 1);

  if (intPart.length === 0) return null;
  if (fracPart.length > 0 && !/^\d+$/.test(fracPart)) return null;

  return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
}

function normalizeCurrency(code: string): string {
  return code.toUpperCase() === "TL" ? "TRY" : code.toUpperCase();
}

/**
 * Mail gövdesini tek satıra indirger.
 *
 * Gövde markdown tabloya sarılı geliyor (`| # Değerli Akbanklı, ... |`)
 * ve içine takip linkleri gömülü. Kalıp eşleşmesinin bunlara takılmaması
 * için link gövdeleri ve tablo işaretleri temizlenir.
 */
function flatten(body: string): string {
  return body
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ") // markdown linkleri
    .replace(/[|#]/g, " ")
    .replace(/[\u00a0\u200b]/g, " ") // kırılmaz ve sıfır genişlikli boşluk
    .replace(/\s+/g, " ")
    .trim();
}

// "1234 ile biten AD SOYAD adına ait Axess Asıl kartınızla|,"
const CARD = String.raw`(\d{4}) ile biten (.+?) adına ait (.+?)(?: kartınızla|,)`;
const AMOUNT = String.raw`([\d.,]+) ?([A-Za-z]{2,3})`;

const PURCHASE_RE = new RegExp(
  `${CARD} (?:(\\d+) ay vadeli )?${AMOUNT} tutarında (.+?) harcaması (temassız olarak )?yapılmıştır`
);

// İptal kalıbı ayrı: fiil değişiyor ve bankanın metninde "kartınızla"
// bir kez fazla geçiyor. Bu tekrarı istemek yerine opsiyonel bırakıyoruz
// ki banka hatayı düzelttiğinde ayrıştırma bozulmasın.
const CANCELLATION_RE = new RegExp(
  `${CARD} yapılan ${AMOUNT} (?:kartınızla )?tutarındaki (.+?) harcamanız iptal edilmiştir`
);

const LIMIT_RE = /([\d.,]+) TL limitiniz kalmıştır/;

export function parseAkbankEmail(input: {
  subject: string;
  body: string;
  from?: string;
}): AkbankParseResult {
  if (input.from && !input.from.toLowerCase().includes("bilgi.akbank.com")) {
    return { ok: false, reason: "Gönderen Akbank değil" };
  }

  const text = flatten(input.body);
  const abroad = /yurt\s*dışı/i.test(input.subject);

  const cancelled = CANCELLATION_RE.exec(text);
  const purchase = cancelled ? null : PURCHASE_RE.exec(text);
  const match = cancelled ?? purchase;
  if (!match) return { ok: false, reason: "Harcama kalıbı bulunamadı" };

  const kind: AkbankTransactionKind = cancelled ? "CANCELLATION" : "PURCHASE";
  const [, cardLast4, cardHolder, cardName] = match;
  // İptal kalıbında "ay vadeli" grubu yok; alan sırası bu yüzden ayrışıyor.
  const installmentRaw = cancelled ? undefined : match[4];
  const offset = cancelled ? 0 : 1;
  const amountRaw = match[4 + offset];
  const currencyRaw = match[5 + offset];
  const sector = match[6 + offset];

  const amount = parseAkbankAmount(amountRaw);
  if (amount === null) {
    return { ok: false, reason: `Tutar okunamadı: "${amountRaw}"` };
  }

  const limitMatch = LIMIT_RE.exec(text);

  return {
    ok: true,
    transaction: {
      kind,
      cardLast4,
      cardName: cardName.trim(),
      cardHolder: cardHolder.trim(),
      amount,
      currency: normalizeCurrency(currencyRaw),
      sector: sector.replace(/\s+,/g, ",").trim(),
      installmentCount: installmentRaw ? Number(installmentRaw) : 1,
      contactless: !cancelled && match[7 + offset] !== undefined,
      abroad,
      remainingLimit: limitMatch ? parseAkbankAmount(limitMatch[1]) : null,
    },
  };
}

/**
 * Banka sektörü → uygulama kategorisi.
 *
 * Eşleşme kasıtlı olarak dar tutuldu: emin olunmayan sektör "Diğer"e
 * düşer. Yanlış kategori, kategorisiz kayıttan daha kötü — kullanıcı
 * boş alanı görüp doldurur ama yanlış doluyu fark etmez.
 *
 * "KREDI KARTI" bankanın sektörü çözemediği hareketlere verdiği genel
 * addır, kategori taşımaz.
 */
export const AKBANK_SECTOR_CATEGORIES: Record<string, string> = {
  YEMEK: "Yeme-İçme",
  "GIDA VE MARKET": "Market",
  "BENZIN ISTASYONU": "Akaryakıt",
  AKARYAKIT: "Akaryakıt",
  OTEL: "Tatil/Seyahat",
  "SEYAHAT ACENTASI": "Tatil/Seyahat",
  "HAVA YOLLARI": "Tatil/Seyahat",
  ELEKTRONIK: "Elektronik",
  "BILGISAYAR VE SARF MALZEMESI": "Elektronik",
  GIYIM: "Giyim",
  "SAGLIK VE KOZMETIK": "Sağlık",
  ECZANE: "Sağlık",
  DOKTOR: "Sağlık",
  HASTANE: "Sağlık",
  KAMU: "Vergi/Resmî Ödeme",
  VERGI: "Vergi/Resmî Ödeme",
  SIGORTA: "Sigorta",
  EGITIM: "Eğitim",
  CICEK: "Hediye",
  // Anahtar, ayrıştırıcının NORMALİZE ETTİĞİ hâlde olmalı: mailde
  // "OYUNCAK ,OYUN" yazıyor ama virgül öncesi boşluk kırpılıyor.
  "OYUNCAK,OYUN": "Eğlence",
  OYUNCAK: "Eğlence",
  SINEMA: "Eğlence",
  ULASIM: "Ulaşım",
  "TAKSI VE ULASIM": "Ulaşım",
  "TELEKOMUNIKASYON": "Faturalar",
  ELEKTRIK: "Faturalar",
  "DOGALGAZ": "Faturalar",
  "SU": "Faturalar",
  "PET SHOP": "Evcil Hayvan",
  VETERINER: "Evcil Hayvan",
};

/** Eşleşme yoksa "Diğer". Kategori adı kullanıcıda yoksa çağıran karar verir. */
export function suggestCategory(sector: string): string {
  return AKBANK_SECTOR_CATEGORIES[sector.toUpperCase().trim()] ?? "Diğer";
}
