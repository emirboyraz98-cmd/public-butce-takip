import Decimal from "decimal.js";

import { formatMoney } from "@/lib/format";

import type { CategoryRef, Metric, ParsedQuestion } from "./parseQuestion";
import { normalize, wordMatches } from "./text";
import {
  addDaysKey,
  dayFromPhrase,
  dayPhrase,
  genitive,
  daysBetween,
  last12Months,
  lastCompleteMonths,
  monthName,
  monthPhrase,
  monthSpec,
  previousPeriod,
  rangeLabel,
  thisMonth,
  todayKey,
  todaySpec,
  weekOf,
  yearSpec,
  type TimeSpec,
} from "./time";

/**
 * Çözümlenmiş soruyu veriyle cevaplar.
 *
 * Saf fonksiyon: veritabanına da kura da dokunmuyor; hareketler baz para
 * birimine çevrilmiş olarak çağırandan geliyor. Böylece her soru tipi
 * sabit bir veriyle tek tek test edilebiliyor.
 *
 * İlke: YALNIZCA SORULANA CEVAP. "Markete ne kadar harcadım" sorusunun
 * cevabı tek bir cümle; kategori dökümü, günlük ortalama, gelir toplamı
 * sorulmadıkça gösterilmiyor. Liste yalnızca listeyi isteyen sorularda
 * ("neler", "ne harcadım", "son harcamalarım") çıkıyor.
 */

export type Movement = {
  /** yyyy-MM-dd. Aylık tekrarda ilk tekrarın günü — sonrakiler ayın aynı günü. */
  date: string;
  direction: "out" | "in";
  categoryName: string;
  note: string | null;
  source: "cash" | "card" | "loan" | "salary" | "income";
  /** Baz para birimine çevrilmiş tutar. */
  amount: Decimal;
  frequency: "ONE_TIME" | "MONTHLY";
  /** yyyy-MM, tekrarlayan kaydın son ayı (dahil). */
  recurrenceEndMonth?: string | null;
  /** Yalnızca maaşta: hak ediş ayı (yyyy-MM). */
  accrualMonth?: string;
  /**
   * Aylık tekrarlayan yabancı para kaydında her tekrarın kendi ayının
   * kuruyla çevrilmiş tutarı. Yoksa her tekrar `amount`.
   */
  amountForMonth?: (month: string) => Decimal;
  /** Kart harcamasında ekstrenin ödendiği ay (yyyy-MM). */
  paymentMonth?: string | null;
};

export type Budget = { categoryName: string; limit: Decimal | null };

export type AnswerInput = {
  question: ParsedQuestion;
  movements: Movement[];
  budgets: Budget[];
  /** Kart için aylık harcama sınırı (baz para biriminde); yoksa null. */
  cardLimit: Decimal | null;
  currency: string;
  now: Date;
};

/** Cümle parçası: `b` vurgulanacak (cevabın kendisi). */
export type Part = { t: string; b?: boolean };

export type Row = { label: string; detail?: string; amount: string };

export type Answer = {
  kind: "answer" | "notFound" | "help" | "empty";
  parts: Part[];
  rows: Row[];
  /** Listede gösterilmeyen kalem sayısı. */
  more: number;
  /** Küçük puntolu bağlam: tarih aralığı ve yapılan varsayım. */
  context: string[];
  link: { href: string; label: string } | null;
  /** Tıklanınca sorulacak örnek sorular. */
  suggestions: string[];
};

export const EXAMPLES = [
  "Bu ay ne kadar harcadım?",
  "Ayın 1'inden beri markete ne kadar harcadım?",
  "En çok neye harcadım?",
  "Geçen aya göre daha mı çok harcadım?",
  "Bu ay ne kadar biriktirdim?",
  "Bütçemi aştım mı?",
  "Son harcamalarım neler?",
  "Hangi ay en çok harcadım?",
];

// ---------------------------------------------------------------------------
// Tekrarların açılması
// ---------------------------------------------------------------------------

/** Bir tekrar: tarihi ve o ayın kuruyla çevrilmiş tutarı. */
type Occ = { date: string; m: Movement; amount: Decimal };

/**
 * Bir hareketin [from, to] aralığına düşen tarihleri.
 *
 * Aylık kayıt, girildiği günün AYIN KAÇI olduğuna demirleniyor: 1 Mayıs'ta
 * girilen kira her ayın 1'inde tekrar ediyor. "Ayın 13'ünden beri" sorusu
 * ayın 1'indeki kirayı saymamalı; ayı bütün olarak saymak yanlış olurdu.
 * O ayda olmayan güne (31 Şubat) denk gelirse ayın son gününe kırpılıyor.
 */
export function occurrencesInRange(m: Movement, from: string, to: string): string[] {
  if (m.frequency === "ONE_TIME") return m.date >= from && m.date <= to ? [m.date] : [];

  const anchor = m.date;
  const anchorDay = Number(anchor.slice(8, 10));
  const sonu = m.recurrenceEndMonth ?? null;
  const out: string[] = [];

  const basla = from > anchor ? from : anchor;
  let yil = Number(basla.slice(0, 4));
  let ay = Number(basla.slice(5, 7)) - 1;
  for (let i = 0; i < 600; i++) {
    const ayAnahtari = `${yil}-${String(ay + 1).padStart(2, "0")}`;
    if (sonu && ayAnahtari > sonu) break;
    const ayinSonu = new Date(Date.UTC(yil, ay + 1, 0)).getUTCDate();
    const tarih = `${ayAnahtari}-${String(Math.min(anchorDay, ayinSonu)).padStart(2, "0")}`;
    if (tarih > to) break;
    if (tarih >= from && tarih >= anchor) out.push(tarih);
    ay += 1;
    if (ay > 11) {
      ay = 0;
      yil += 1;
    }
  }
  return out;
}

function ac(ms: Movement[], from: string, to: string): Occ[] {
  const out: Occ[] = [];
  for (const m of ms) {
    for (const date of occurrencesInRange(m, from, to)) {
      out.push({ date, m, amount: m.amountForMonth ? m.amountForMonth(date.slice(0, 7)) : m.amount });
    }
  }
  return out;
}

function topla(occ: Occ[]): Decimal {
  return occ.reduce((s, o) => s.plus(o.amount), new Decimal(0));
}

// ---------------------------------------------------------------------------
// Biçim yardımcıları
// ---------------------------------------------------------------------------

function cap(s: string): string {
  return s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
}

const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function kisaTarih(key: string, now: Date): string {
  const y = Number(key.slice(0, 4));
  const ay = AY_KISA[Number(key.slice(5, 7)) - 1];
  const gun = Number(key.slice(8, 10));
  return y === now.getUTCFullYear() ? `${gun} ${ay}` : `${gun} ${ay} ${y}`;
}

/*
 * Yüzdenin iyelik eki: "%18'i", "%20'si", "%40'ı", "%100'ü". Ek, sayının
 * okunuşunun son sözcüğüne göre değişiyor.
 */
const OKUNUS_BIR = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const OKUNUS_ON = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];

function iyelik(n: number): string {
  const s =
    n === 0
      ? "sıfır"
      : n % 10 !== 0
        ? OKUNUS_BIR[n % 10]
        : n % 100 !== 0
          ? OKUNUS_ON[Math.floor(n / 10) % 10]
          : n % 1000 !== 0
            ? "yüz"
            : "bin";
  const unlu = (s.match(/[aeıioöuü]/g) ?? ["e"]).at(-1)!;
  const ek = /[aı]/.test(unlu) ? "ı" : /[ei]/.test(unlu) ? "i" : /[ou]/.test(unlu) ? "u" : "ü";
  return /[aeıioöuü]$/.test(s) ? `s${ek}` : ek;
}

function yuzde(oran: number): string {
  const n = Math.round(oran);
  return `%${n}`;
}

function yuzdeIyelik(oran: number): string {
  const n = Math.round(Math.abs(oran));
  return `%${n}'${iyelik(n)}`;
}

/** "%78'ini", "%20'sini", "%40'ını" — yüzdenin belirtme hâli. */
function yuzdeBelirtme(oran: number): string {
  const n = Math.round(Math.abs(oran));
  const iy = iyelik(n);
  return `%${n}'${iy}n${iy.at(-1)}`;
}

function ve(adlar: string[]): string {
  if (adlar.length <= 1) return adlar.join("");
  return `${adlar.slice(0, -1).join(", ")} ve ${adlar.at(-1)}`;
}

// ---------------------------------------------------------------------------
// Not araması ve eş anlamlılar
// ---------------------------------------------------------------------------

/*
 * Notlarda bulunamayan sözcük için yedek: kullanıcı "benzine ne kadar
 * verdim" diye soruyor ama kaydına not yazmamış.
 *
 * İki ayrı liste var. ESDEGER sözcükler kategorinin kendisini anlatıyor
 * (benzin = Akaryakıt): cevap doğrudan o kategoriden veriliyor ve bu
 * söyleniyor. ALT sözcükler kategorinin yalnızca bir parçası (konser ⊂
 * Eğlence): onlar için kategorinin tamamını vermek soruyu çarpıtırdı —
 * sinema bileti "konser" diye toplanırdı. O yüzden "bulamadım" deniyor ve
 * kategori öneri olarak sunuluyor.
 */
const ESDEGER: Record<string, string[]> = {
  akaryakit: ["benzin", "mazot", "motorin", "dizel", "yakit", "lpg"],
  "yeme-icme": ["yemek", "restoran", "lokanta"],
  faturalar: ["fatura"],
  abonelikler: ["abonelik", "uyelik"],
  giyim: ["kiyafet", "giysi"],
  "tatil/seyahat": ["tatil", "seyahat", "gezi"],
  "bakim/onarim": ["tamir", "tadilat", "bakim"],
  "vergi/resmi odeme": ["vergi"],
};

const ALT: Record<string, string[]> = {
  akaryakit: ["benzin", "mazot", "motorin", "dizel", "yakit", "lpg", "shell", "opet", "petrol", "totalenerji"],
  market: ["bakkal", "migros", "bim", "a101", "sok", "carrefour", "manav", "kasap", "sarkuteri", "gida"],
  "yeme-icme": ["yemek", "restoran", "lokanta", "kafe", "kahve", "starbucks", "cafe", "yemeksepeti", "burger", "pizza", "doner", "kebap", "trendyolyemek"],
  ulasim: ["otobus", "metro", "taksi", "uber", "bitaksi", "marmaray", "istanbulkart", "dolmus", "vapur", "tren", "otopark", "kopru", "otoyol", "hgs", "ogs", "marti"],
  faturalar: ["elektrik", "dogalgaz", "internet", "fatura", "turkcell", "vodafone", "telekom", "superonline", "igdas", "enerjisa", "iski", "aski"],
  abonelikler: ["netflix", "spotify", "youtube", "disney", "prime", "exxen", "blutv", "icloud", "abonelik", "uyelik", "chatgpt", "gain", "tod"],
  eglence: ["sinema", "konser", "tiyatro", "bilet", "oyun", "steam", "playstation", "bar", "parti", "festival", "biletix"],
  saglik: ["ilac", "eczane", "doktor", "hastane", "disci", "muayene", "tahlil", "gozluk"],
  giyim: ["kiyafet", "ayakkabi", "pantolon", "gomlek", "mont", "ceket", "elbise", "zara", "lcw", "defacto"],
  elektronik: ["bilgisayar", "laptop", "kulaklik", "tablet", "sarj", "teknosa", "mediamarkt", "vatan"],
  egitim: ["kurs", "kitap", "okul", "universite", "udemy", "ders", "kirtasiye"],
  "tatil/seyahat": ["otel", "ucak", "ucus", "tatil", "seyahat", "pegasus", "thy", "ajet", "booking", "airbnb", "pansiyon"],
  hediye: ["cicek", "dogum"],
  "bakim/onarim": ["tamir", "tamirci", "servis", "usta", "boya", "tadilat", "bakim"],
  "evcil hayvan": ["mama", "veteriner", "kedi", "kopek"],
  "vergi/resmi odeme": ["vergi", "ceza", "mtv", "noter", "tapu", "pasaport", "ehliyet"],
  sigorta: ["kasko", "dask"],
  aidat: ["site", "yonetim"],
};

type NotSonucu =
  | { tur: "yok" }
  | { tur: "not"; ms: Movement[]; goster: string }
  | { tur: "kategori"; ms: Movement[]; kategori: string; terim: string }
  | { tur: "oneri"; kategori: string; terim: string }
  | { tur: "bulunamadi"; terim: string };

function notGoster(ham: string): string {
  return ham.charAt(0).toLocaleUpperCase("tr") + ham.slice(1).toLocaleLowerCase("tr");
}

/**
 * @param terms Katlanmış sözcükler ("benzine").
 * @param etiketler Aynı sözcüklerin kullanıcının yazdığı hâli ("benzine",
 *   Türkçe harfleriyle) — cevapta gösterilen bu.
 */
function notAra(terms: string[], etiketler: string[], havuz: Movement[], tumu: Movement[]): NotSonucu {
  if (terms.length === 0) return { tur: "yok" };

  let enIyi = 0;
  const skor = new Map<Movement, number>();
  let goster = "";
  for (const m of havuz) {
    if (!m.note) continue;
    const hamlar = m.note.split(/[\s\-–—/,.;:()]+/).filter(Boolean);
    const katli = hamlar.map((h) => normalize(h));
    let n = 0;
    for (const t of terms) {
      const i = katli.findIndex((k) => k.length >= 2 && wordMatches(t, k));
      if (i >= 0) {
        n++;
        if (!goster) goster = notGoster(hamlar[i]);
      }
    }
    if (n > 0) skor.set(m, n);
    if (n > enIyi) enIyi = n;
  }
  if (enIyi > 0) {
    const ms = havuz.filter((m) => skor.get(m) === enIyi);
    // Birden çok sözcük eşleştiyse ilkini göstermek yanıltır; soruda
    // yazıldığı gibi göster.
    return { tur: "not", ms, goster: enIyi > 1 ? terms.join(" ") : goster };
  }

  // Notta yok: eş anlamlı kategori.
  const kategoriler = new Map<string, string>();
  for (const m of tumu) kategoriler.set(normalize(m.categoryName), m.categoryName);
  const etiket = (i: number) => etiketler[i] ?? terms[i];
  for (const [i, t] of terms.entries()) {
    for (const [kat, esler] of Object.entries(ESDEGER)) {
      const ad = kategoriler.get(kat);
      if (ad && esler.some((e) => wordMatches(t, e))) {
        return { tur: "kategori", ms: havuz.filter((m) => m.categoryName === ad), kategori: ad, terim: etiket(i) };
      }
    }
  }
  for (const [i, t] of terms.entries()) {
    for (const [kat, esler] of Object.entries(ALT)) {
      const ad = kategoriler.get(kat);
      if (ad && esler.some((e) => wordMatches(t, e))) return { tur: "oneri", kategori: ad, terim: etiket(i) };
    }
  }
  return { tur: "bulunamadi", terim: etiket(0) };
}

// ---------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------

type Durum = {
  q: ParsedQuestion;
  now: Date;
  today: string;
  currency: string;
  /** Tüm filtreler uygulanmış hareketler. */
  ms: Movement[];
  /** Yalnızca ölçü filtresi (oran ve paydalar için). */
  olcuHavuzu: Movement[];
  /** Hiç filtrelenmemiş hareketler ("gelirimin ne kadarını harcadım"). */
  tumu: Movement[];
  /** "Market için", "kredi kartıyla", "“Konser” için" — boş olabilir. */
  filtre: string;
  /** Kategori adıyla filtrelendi mi (son kayıtta kategori adı tekrar etmesin). */
  kategoriyle: boolean;
  context: string[];
  para: (d: Decimal) => string;
  /** En eski hareketin tarihi; "şimdiye kadar" bununla başlıyor. */
  ilkTarih: string;
};

function bos(kind: Answer["kind"], parts: Part[], extra: Partial<Answer> = {}): Answer {
  return { kind, parts, rows: [], more: 0, context: [], link: null, suggestions: [], ...extra };
}

export function answerQuestion(inp: AnswerInput): Answer {
  const { question: q, now } = inp;
  const today = todayKey(now);
  const para = (d: Decimal) => formatMoney(d.toNumber(), inp.currency);

  if (q.intent === "help") {
    return bos(
      "help",
      [
        {
          t:
            "Harcama, gelir, birikim, bütçe ve karşılaştırma sorularını kendi kayıtlarından cevaplıyorum. " +
            "Zamanı (\"geçen ay\", \"ayın 13'ünden beri\"), kategoriyi (\"markete\") ya da notta geçen bir sözcüğü yazabilirsin.",
        },
      ],
      { suggestions: EXAMPLES.slice(0, 6) }
    );
  }

  if (q.intent === "thanks") {
    return bos("help", [{ t: "Rica ederim! Başka bir şey sormak istersen buradayım." }]);
  }

  if (q.intent === "outOfScope") {
    return bos(
      "notFound",
      [
        {
          t:
            "Yatırım, kur ve piyasa sorularını cevaplayamıyorum; buradaki cevaplar yalnızca gelir ve gider kayıtlarından. " +
            "Portföyün Yatırımlar sayfasında.",
        },
      ],
      { link: { href: "/investments", label: "Yatırımlar" }, suggestions: EXAMPLES.slice(0, 3) }
    );
  }

  if (inp.movements.length === 0) {
    return bos("empty", [{ t: "Henüz hiç gelir ya da gider kaydın yok; önce birkaç kayıt ekle." }], {
      link: { href: "/expenses", label: "Gider ekle" },
    });
  }

  const ilkTarih = inp.movements.reduce((a, m) => (m.date < a ? m.date : a), today);

  // --- Ölçü filtresi ------------------------------------------------------
  const loanAsked = q.source === "loan" || q.categories.some((c) => c.side === "loan");
  const olcuHavuzu = inp.movements.filter((m) => olcuyeUyar(m, q.metric, loanAsked));

  // --- Kaynak ve kategori filtreleri --------------------------------------
  let ms = olcuHavuzu;
  const context: string[] = [];
  const filtreParcalari: string[] = [];

  if (q.source && q.metric !== "net") {
    ms = ms.filter((m) =>
      q.source === "card"
        ? m.source === "card"
        : q.source === "cash"
          ? m.source === "cash"
          : q.source === "loan"
            ? m.source === "loan"
            : m.source === "salary"
    );
    if (q.source === "card") filtreParcalari.push("kredi kartıyla");
    if (q.source === "card" && q.mentionsDebt) {
      context.push("Ekstre borcunu hesaplamıyorum; bu, harcama tarihine göre kart toplamı. Ödenecek tutar Kredi kartı sekmesinde.");
    }
    if (q.source === "cash") filtreParcalari.push("nakit ve havaleyle");
  }

  const katlar = kategorileriSec(q.categories, q.metric);
  if (katlar.length > 0 && q.metric !== "net") {
    const adlar = new Set(katlar.map((c) => c.name));
    ms = ms.filter((m) => adlar.has(m.categoryName));
    const liste = ve(katlar.map((c) => c.name));
    filtreParcalari.push(q.metric === "income" ? `${liste} kaleminden` : `${liste} için`);
  }

  // --- Not araması --------------------------------------------------------
  let esAnlamKategori = false;
  if (q.noteTerms.length > 0 && q.metric !== "net") {
    const sonuc = notAra(q.noteTerms, q.noteLabels, ms, olcuHavuzu);
    if (sonuc.tur === "not") {
      ms = sonuc.ms;
      // "elektrik faturası": not kategoriyi zaten daraltıyor; "Faturalar
      // için “Elektrik” için" demek yerine yalnızca not.
      if (katlar.length > 0 && q.metric !== "income") filtreParcalari.pop();
      filtreParcalari.push(`“${sonuc.goster}” için`);
    } else if (sonuc.tur === "kategori") {
      ms = sonuc.ms;
      esAnlamKategori = true;
      filtreParcalari.push(`${sonuc.kategori} için`);
      context.push(`Notlarında “${sonuc.terim}” geçmiyor; ${sonuc.kategori} kategorisine baktım.`);
    } else if (sonuc.tur === "oneri" && katlar.length === 0) {
      const zaman = q.time ? cap(q.time.phrase) : "Bu ay";
      return bos(
        "notFound",
        [
          { t: "Notlarında " },
          { t: `“${sonuc.terim}”`, b: true },
          { t: ` geçen bir harcama bulamadım. İstersen ${sonuc.kategori} kategorisinin tamamına bakayım.` },
        ],
        { suggestions: [`${zaman} ${sonuc.kategori} için ne kadar harcadım?`] }
      );
    } else if (sonuc.tur === "bulunamadi" || sonuc.tur === "oneri") {
      if (katlar.length > 0) {
        // Kategori zaten bulundu; tanınmayan sözcük yalnızca daraltma
        // isteğiydi ("elektrik faturası"). Kategorinin tamamı, açıkça.
        context.push(`Notlarında “${sonuc.terim}” geçen kayıt yok; kategorinin tamamını aldım.`);
      } else {
        const sik = enCokKullanilanKategoriler(olcuHavuzu, 3);
        return bos(
          "notFound",
          [
            { t: "Kayıtlarında " },
            { t: `“${sonuc.terim}”`, b: true },
            { t: " geçen bir harcama bulamadım. Kategori adıyla sorarsan bakabilirim." },
          ],
          {
            suggestions: sik.map((k) => `Bu ay ${k} için ne kadar harcadım?`),
            context: kategoriListesi(olcuHavuzu),
          }
        );
      }
    }
  }

  const durum: Durum = {
    q,
    now,
    today,
    currency: inp.currency,
    ms,
    olcuHavuzu,
    tumu: inp.movements,
    filtre: filtreParcalari.join(" "),
    kategoriyle: katlar.length > 0 || esAnlamKategori,
    context,
    para,
    ilkTarih,
  };

  switch (q.intent) {
    case "budget":
      return butce(durum, inp.budgets, inp.cardLimit, katlar);
    case "salary":
      return maas(durum);
    case "savingsRate":
      return tasarrufOrani(durum);
    case "share":
      return pay(durum);
    case "compare":
      return karsilastir(durum);
    case "bestPeriod":
      return enIyiDonem(durum);
    case "largest":
      return enBuyuk(durum);
    case "last":
      return enSon(durum);
    case "recent":
      return sonKayitlar(durum);
    case "count":
      return sayi(durum);
    case "top":
      return enCok(durum);
    case "average":
      return ortalama(durum);
    default:
      // Alışkanlık sorusu ("yemeğe ne kadar gidiyor") aylık ortalama ister;
      // kredi taksidi ise zaten sabit, bu ayınki yeter.
      if (q.habitual && !q.time && q.metric !== "net" && q.source !== "loan") return ortalama(durum, true);
      return toplam(durum);
  }
}

function olcuyeUyar(m: Movement, metric: Metric, loanAsked: boolean): boolean {
  if (metric === "income") return m.direction === "in";
  if (metric === "net") return true;
  if (m.direction !== "out") return false;
  // Kredi taksitleri "harcama" değil; sorulmadıkça gider toplamına girmiyor
  // (Giderler sayfası da onları ayrı sekmede tutuyor).
  return m.source !== "loan" || loanAsked;
}

/** Ölçüyle çelişen kategori eşleşmelerini at ("kira" gider sorusunda gelir kategorisi değil). */
function kategorileriSec(cats: CategoryRef[], metric: Metric): CategoryRef[] {
  if (metric === "income") return cats.filter((c) => c.side === "income");
  if (metric === "expense") return cats.filter((c) => c.side !== "income");
  return [];
}

function enCokKullanilanKategoriler(ms: Movement[], n: number): string[] {
  const say = new Map<string, number>();
  for (const m of ms) if (m.source !== "loan" && m.source !== "salary") say.set(m.categoryName, (say.get(m.categoryName) ?? 0) + 1);
  return [...say.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function kategoriListesi(ms: Movement[]): string[] {
  const adlar = enCokKullanilanKategoriler(ms, 8);
  return adlar.length > 0 ? [`Kategorilerin: ${adlar.join(", ")}`] : [];
}

// ---------------------------------------------------------------------------
// Dönem seçimi
// ---------------------------------------------------------------------------

type Donem = { spec: TimeSpec; varsayim: string | null };

function tumZamanlar(d: Durum): TimeSpec {
  return { from: d.ilkTarih, to: d.today, phrase: "şimdiye kadar", kind: "all" };
}

function donem(d: Durum, varsayilan: () => Donem): Donem {
  if (d.q.time) return { spec: d.q.time.kind === "all" ? tumZamanlar(d) : d.q.time, varsayim: null };
  return varsayilan();
}

function buAy(d: Durum): Donem {
  // Not araması belli bir şeyi arıyor ("konser"): bu aya sıkıştırmak,
  // geçen ay alınmış bileti "yok" diye cevaplardı.
  if (d.q.noteTerms.length > 0 && !d.kategoriyle) {
    // Bu ayın ileri tarihli kayıtları da dahil ("doğalgaz ne kadar geldi"
    // sorulduğunda ayın 20'sine girilmiş fatura bulunmalı).
    const ay = thisMonth(d.now);
    return {
      spec: { from: d.ilkTarih, to: ay.to, phrase: "toplamda", kind: "all" },
      varsayim: "Zaman belirtmediğin için tüm kayıtlarına baktım.",
    };
  }
  return { spec: thisMonth(d.now), varsayim: "Zaman belirtmediğin için bu ayı aldım." };
}

function baglam(d: Durum, p: Donem, ...ek: string[]): string[] {
  return [rangeLabel(p.spec.from, p.spec.to), ...(p.varsayim ? [p.varsayim] : []), ...d.context, ...ek];
}

/**
 * Kart harcaması dönemin dışındaki bir ekstreye düştüyse söyle: burada
 * harcama GÜNÜ sayılıyor (Bütçeler sayfası gibi), Genel Bakış'taki aylık
 * döküm ise ödeme ayını kullanıyor. Not olmadan iki rakam çelişkili
 * görünür.
 */
function kartNotu(occ: Occ[], spec: TimeSpec): string[] {
  // Yalnızca ay sorularında: Genel Bakış dökümü aylık, kıyas orada yapılıyor.
  if (spec.kind !== "month") return [];
  const bas = spec.from.slice(0, 7);
  const bit = spec.to.slice(0, 7);
  const disarida = occ.some(
    (o) => o.m.source === "card" && o.m.paymentMonth && (o.m.paymentMonth < bas || o.m.paymentMonth > bit)
  );
  return disarida
    ? ["Kart harcamaları harcama gününe göre; Genel Bakış'taki döküm ekstrenin ödendiği aya göre."]
    : [];
}

/** Aralığı bugünle sınırlar: ortalama ve karşılaştırma gelecek günleri saymasın. */
function bugune(spec: TimeSpec, today: string): TimeSpec {
  return spec.to > today && spec.from <= today ? { ...spec, to: today } : spec;
}

function esikUygula(d: Durum, occ: Occ[]): Occ[] {
  const { minAmount, maxAmount } = d.q;
  return occ.filter(
    (o) =>
      (minAmount === null || o.amount.gte(minAmount)) && (maxAmount === null || o.amount.lte(maxAmount))
  );
}

function aralikta(d: Durum, spec: TimeSpec, ms = d.ms): Occ[] {
  return esikUygula(d, ac(ms, spec.from, spec.to));
}

function gelecekMi(d: Durum, spec: TimeSpec): boolean {
  return spec.from > d.today;
}

// ---------------------------------------------------------------------------
// Cümle kurucular
// ---------------------------------------------------------------------------

/** "Bu ay Market için" — dönem + filtre, cümlenin öznesi. */
function ozne(d: Durum, spec: TimeSpec): string {
  return cap([spec.phrase, d.filtre].filter(Boolean).join(" "));
}

function tutarCumlesi(d: Durum, spec: TimeSpec, tutar: Decimal): Part[] {
  const bas = ozne(d, spec);
  const g = gelecekMi(d, spec);
  if (d.q.metric === "income") {
    if (d.q.source === "salary") return [{ t: `${bas} maaş olarak ` }, { t: d.para(tutar), b: true }, { t: g ? " yatacak." : " yattı." }];
    return [{ t: `${bas} ` }, { t: d.para(tutar), b: true }, { t: g ? " gelir görünüyor." : " gelirin oldu." }];
  }
  if (d.q.source === "loan") {
    const ne = d.kategoriyle ? " taksit" : "";
    const bas2 = d.kategoriyle ? `${bas} ` : `${bas} kredi taksitlerine `;
    return [{ t: bas2 }, { t: d.para(tutar), b: true }, { t: `${ne}${g ? " ödeyeceksin." : " ödedin."}` }];
  }
  return [{ t: `${bas} ` }, { t: d.para(tutar), b: true }, { t: g ? " gider görünüyor." : " harcadın." }];
}

function bosCumle(d: Durum, spec: TimeSpec): Part[] {
  const bas = ozne(d, spec);
  if (d.q.minAmount !== null || d.q.maxAmount !== null) {
    const esik =
      d.q.minAmount !== null
        ? `${formatMoney(d.q.minAmount, d.currency)} üstünde`
        : `${formatMoney(d.q.maxAmount!, d.currency)} altında`;
    return [{ t: `${bas} ${esik} ${d.q.metric === "income" ? "gelirin" : "harcaman"} yok.` }];
  }
  if (d.q.metric === "income") return [{ t: `${bas} gelir kaydın yok.` }];
  if (d.q.source === "loan" && !d.kategoriyle) return [{ t: `${bas} kredi taksidin yok.` }];
  return [{ t: `${bas} harcama kaydın yok.` }];
}

/** Boş sonuçta en son ne zaman olduğunu söyle: "yok" tek başına çıkmaz sokak. */
function sonKayitIpucu(d: Durum, spec: TimeSpec): Part[] {
  const occ = esikUygula(d, ac(d.ms, d.ilkTarih, d.today)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const son = occ[0];
  if (!son) return [];
  // Dönem kayıtların başlangıcından önceyse: neden boş olduğu bu.
  const ilk = occ.at(-1)!;
  if (spec.to < ilk.date) return [{ t: ` Kayıtların ${dayFromPhrase(ilk.date, d.now)} başlıyor.` }];
  // Dönemden sonra kayıt varsa "en son" bilgisi soruyla ilgisiz.
  if (son.date > spec.to) return [];
  const fiil = d.q.metric === "income" ? "gelirin olmuş" : "harcamışsın";
  return [{ t: ` En son ${dayPhrase(son.date, d.now)} ${d.para(son.amount)} ${fiil}.` }];
}

function kalemSatiri(o: Occ, now: Date, para: (x: Decimal) => string): Row {
  const tekrar = o.m.frequency === "MONTHLY" ? " · aylık" : "";
  return o.m.note
    ? { label: o.m.note, detail: `${kisaTarih(o.date, now)} · ${o.m.categoryName}${tekrar}`, amount: para(o.amount) }
    : { label: o.m.categoryName, detail: `${kisaTarih(o.date, now)}${tekrar}`, amount: para(o.amount) };
}

function kategoriSatirlari(occ: Occ[], para: (x: Decimal) => string, toplamTutar: Decimal): Row[] {
  const g = new Map<string, Decimal>();
  for (const o of occ) g.set(o.m.categoryName, (g.get(o.m.categoryName) ?? new Decimal(0)).plus(o.amount));
  return [...g.entries()]
    .sort((a, b) => b[1].comparedTo(a[1]))
    .map(([k, v]) => ({
      label: k,
      detail: toplamTutar.isZero() ? undefined : yuzde(v.div(toplamTutar).mul(100).toNumber()),
      amount: para(v),
    }));
}

function link(d: Durum): Answer["link"] {
  if (d.q.source === "salary") return { href: "/salary", label: "Maaş sayfası" };
  if (d.q.source === "loan") return { href: "/expenses", label: "Krediler" };
  if (d.q.metric === "income") return { href: "/income", label: "Gelirler sayfası" };
  if (d.q.metric === "net") return { href: "/reports", label: "Raporlar" };
  return { href: "/expenses", label: "Giderler sayfası" };
}

// ---------------------------------------------------------------------------
// Soru tipleri
// ---------------------------------------------------------------------------

function toplam(d: Durum): Answer {
  const p = donem(d, () => buAy(d));
  const spec = p.spec;

  if (d.q.metric === "net") return net(d, p);

  const occ = aralikta(d, spec);
  if (occ.length === 0) {
    return bos("answer", [...bosCumle(d, spec), ...sonKayitIpucu(d, spec)], { context: baglam(d, p), link: link(d) });
  }
  const tutar = topla(occ);
  const esikVar = d.q.minAmount !== null || d.q.maxAmount !== null;

  let parts: Part[];
  if (esikVar) {
    const esik =
      d.q.minAmount !== null
        ? `${formatMoney(d.q.minAmount, d.currency)} üstünde`
        : `${formatMoney(d.q.maxAmount!, d.currency)} altında`;
    const ad = d.q.metric === "income" ? "gelirin" : "harcaman";
    parts = [{ t: `${ozne(d, spec)} ${esik} ${occ.length} ${ad} var, toplam ` }, { t: d.para(tutar), b: true }, { t: "." }];
  } else if (d.q.future && spec.from <= d.today && d.today < spec.to) {
    // "Bu ay ne kadar harcayacağım": dönemin tamamı (tekrarlayanlar dahil)
    // ve bugüne kadarki kısmı.
    const simdiye = topla(occ.filter((o) => o.date <= d.today));
    parts = [
      { t: `${ozne(d, spec)} toplam ` },
      { t: d.para(tutar), b: true },
      { t: `${d.q.metric === "income" ? " gelir" : " gider"} görünüyor; bugüne kadar ${d.para(simdiye)}.` },
    ];
  } else {
    parts = tutarCumlesi(d, spec, tutar);
  }

  // Gelir birden çok kaynaktan geldiyse hangilerinden olduğu cevabın parçası.
  if (d.q.metric === "income" && d.q.source === null && !d.kategoriyle) {
    const g = kategoriSatirlari(occ, d.para, tutar);
    if (g.length >= 2 && g.length <= 3) {
      const son = parts.at(-1)!;
      son.t = `${son.t.replace(/\.$/, "")} (${g.map((r) => `${r.label} ${r.amount}`).join(", ")}).`;
    }
  }

  // Kalemler yalnızca istendiyse: "ne harcadım", "neler", "listele", eşik.
  let rows: Row[] = [];
  let more = 0;
  const ister = d.q.intent === "list" || d.q.wantsItems || esikVar;
  if (ister) {
    const sirali = [...occ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount.comparedTo(a.amount)));
    if (sirali.length <= 12 || d.q.intent === "list" || esikVar) {
      rows = sirali.slice(0, 10).map((o) => kalemSatiri(o, d.now, d.para));
      more = Math.max(0, sirali.length - 10);
    } else {
      // Çok kalem var: "ne harcadım" sorusuna en okunur cevap kategori dökümü.
      const k = kategoriSatirlari(occ, d.para, tutar);
      rows = k.slice(0, 6);
      more = Math.max(0, k.length - 6);
    }
  }

  return { kind: "answer", parts, rows, more, context: baglam(d, p, ...kartNotu(occ, spec)), link: link(d), suggestions: [] };
}

function netHesap(d: Durum, spec: TimeSpec) {
  const occ = esikUygula(d, ac(d.olcuHavuzu, spec.from, spec.to));
  const gelir = topla(occ.filter((o) => o.m.direction === "in"));
  const gider = topla(occ.filter((o) => o.m.direction === "out"));
  const kredi = occ.some((o) => o.m.source === "loan");
  return { gelir, gider, fark: gelir.minus(gider), kredi };
}

function net(d: Durum, p: Donem): Answer {
  const { gelir, gider, fark, kredi } = netHesap(d, p.spec);
  const bas = cap(p.spec.phrase);
  const g = gelecekMi(d, p.spec);
  const ayrinti = ` Gelir ${d.para(gelir)}, gider ${d.para(gider)}.`;
  let parts: Part[];
  if (gelir.isZero() && gider.isZero()) {
    parts = [{ t: `${bas} hiç gelir ya da gider kaydın yok.` }];
  } else if (fark.gte(0)) {
    const fiil = g ? " artıda kalman bekleniyor." : d.q.asksRemaining ? " elinde kaldı." : " biriktirdin.";
    parts = [{ t: `${bas} ` }, { t: d.para(fark), b: true }, { t: fiil }, { t: ayrinti }];
  } else {
    parts = [
      { t: `${bas} giderin gelirini ` },
      { t: d.para(fark.abs()), b: true },
      { t: g ? " aşacak gibi görünüyor." : " aştı." },
      { t: ayrinti },
    ];
  }
  return {
    kind: "answer",
    parts,
    rows: [],
    more: 0,
    context: baglam(d, p, ...(kredi ? ["Kredi taksitleri gidere dahil."] : [])),
    link: link(d),
    suggestions: [],
  };
}

function sayi(d: Durum): Answer {
  const p = donem(d, () => buAy(d));
  const occ = aralikta(d, p.spec);
  const bas = ozne(d, p.spec);
  const parts: Part[] =
    occ.length === 0
      ? [...bosCumle(d, p.spec), ...sonKayitIpucu(d, p.spec)]
      : d.q.metric === "income"
        ? [{ t: `${bas} ` }, { t: `${occ.length} gelir kaydın`, b: true }, { t: " var." }]
        : [{ t: `${bas} ` }, { t: `${occ.length} kez`, b: true }, { t: " harcama yaptın." }];
  return { kind: "answer", parts, rows: [], more: 0, context: baglam(d, p), link: link(d), suggestions: [] };
}

const BIRIM = {
  day: { sifat: "günlük", ad: "gün" },
  week: { sifat: "haftalık", ad: "hafta" },
  month: { sifat: "aylık", ad: "ay" },
  year: { sifat: "yıllık", ad: "yıl" },
} as const;

function ortalama(d: Durum, aliskanlik = false): Answer {
  const unit = aliskanlik ? "month" : d.q.unit;
  const p = donem(d, (): Donem => {
    if (unit === "day") return { spec: { ...thisMonth(d.now), to: d.today }, varsayim: "Bu ayın bugüne kadarki günlerine baktım." };
    if (unit === "week") {
      return {
        spec: { from: addDaysKey(d.today, -27), to: d.today, phrase: "son 4 haftada", kind: "lastN" },
        varsayim: "Son 4 haftaya baktım.",
      };
    }
    if (unit === "year") return { spec: tumZamanlar(d), varsayim: null };
    return { spec: lastCompleteMonths(3, d.now), varsayim: "Son 3 tam aya baktım; içinde bulunduğun ay yarım olduğu için dışarıda." };
  });

  let spec = bugune(p.spec, d.today);
  // Aylık ortalamada yarım ay ortalamayı düşürür: birden çok ay varsa
  // içinde bulunulan ay dışarıda.
  if (unit === "month" && spec.to.slice(0, 7) === d.today.slice(0, 7) && spec.from.slice(0, 7) < d.today.slice(0, 7)) {
    const oncekiAySonu = addDaysKey(`${d.today.slice(0, 7)}-01`, -1);
    spec = { ...spec, to: oncekiAySonu };
    d.context.push("İçinde bulunduğun ay yarım olduğu için ortalamaya katılmadı.");
  }

  const gun = Math.max(1, daysBetween(spec.from, spec.to));
  const bolen =
    unit === "day"
      ? gun
      : unit === "week"
        ? gun / 7
        : unit === "month"
          ? ayFarki(spec.from, spec.to)
          : Math.max(1, gun / 365);

  const tutar = d.q.metric === "net" ? netHesap(d, spec).fark : topla(aralikta(d, spec));
  const ort = tutar.div(bolen);
  const b = BIRIM[unit];
  const bas = ozne(d, p.spec);
  const ad =
    d.q.metric === "income" ? "gelirin" : d.q.metric === "net" ? "birikimin" : d.q.source === "loan" ? "taksidin" : "harcaman";
  const bolenMetni =
    unit === "week" ? `${Math.round(gun / 7)} haftada` : unit === "month" ? `${ayFarki(spec.from, spec.to)} ayda` : `${gun} günde`;

  const parts: Part[] =
    tutar.isZero() && d.q.metric !== "net"
      ? bosCumle(d, p.spec)
      : [
          { t: `${bas} ${b.sifat} ortalama ${ad} ` },
          { t: d.para(ort), b: true },
          { t: unit === "year" ? "." : ` (${bolenMetni} toplam ${d.para(tutar)}).` },
        ];

  // Alışkanlık sorusunda ("yemeğe ne kadar gidiyor") ve ortalamanın
  // boş çıktığı durumda içinde bulunulan ay da cevabın parçası.
  if (aliskanlik || (tutar.isZero() && unit === "month")) {
    const buAyOcc = aralikta(d, thisMonth(d.now));
    const buAyTutar = topla(buAyOcc.filter((o) => o.date <= d.today));
    if (aliskanlik || !buAyTutar.isZero()) parts.push({ t: ` Bu ay şimdiye kadar ${d.para(buAyTutar)}.` });
  }

  return {
    kind: "answer",
    parts,
    rows: [],
    more: 0,
    context: baglam(d, { ...p, spec }),
    link: link(d),
    suggestions: [],
  };
}

function ayFarki(from: string, to: string): number {
  const a = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const b = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return Math.max(1, b - a + 1);
}

function enCok(d: Durum): Answer {
  const p = donem(d, () => buAy(d));
  const occ = aralikta(d, p.spec);
  const tutar = topla(occ);
  if (occ.length === 0) {
    return bos("answer", [...bosCumle(d, p.spec), ...sonKayitIpucu(d, p.spec)], { context: baglam(d, p), link: link(d) });
  }
  const satirlar = kategoriSatirlari(occ, d.para, tutar);
  const bas = ozne(d, p.spec);
  const gelir = d.q.metric === "income";

  if (d.q.wantsBreakdown) {
    return {
      kind: "answer",
      parts: [{ t: `${bas} ${gelir ? "gelirin" : "giderlerin"} ` }, { t: d.para(tutar), b: true }, { t: "; kategorilere göre:" }],
      rows: satirlar.slice(0, 8),
      more: Math.max(0, satirlar.length - 8),
      context: baglam(d, p),
      link: link(d),
      suggestions: [],
    };
  }

  const sec = d.q.direction === "min" ? satirlar.at(-1)! : satirlar[0];
  const secTutar = topla(occ.filter((o) => o.m.categoryName === sec.label));
  const secPay = secTutar.div(tutar).mul(100).toNumber();
  if (satirlar.length === 1) {
    return {
      kind: "answer",
      parts: [
        { t: `${bas} yalnızca ` },
        { t: sec.label, b: true },
        { t: gelir ? " kaleminden gelirin var: " : " için harcama yaptın: " },
        { t: sec.amount, b: true },
        { t: "." },
      ],
      rows: [],
      more: 0,
      context: baglam(d, p),
      link: link(d),
      suggestions: [],
    };
  }
  const enAz = d.q.direction === "min";
  const parts: Part[] = gelir
    ? [{ t: `${bas} en ${enAz ? "az" : "çok"} gelirin ` }, { t: sec.label, b: true }, { t: " kaleminden: " }, { t: sec.amount, b: true }]
    : [{ t: `${bas} en ${enAz ? "az" : "çok"} ` }, { t: sec.label, b: true }, { t: " için harcadın: " }, { t: sec.amount, b: true }];
  const neyin = gelir
    ? "gelirinin"
    : d.q.source === "card"
      ? "kart harcamalarının"
      : d.q.source === "cash"
        ? "nakit harcamalarının"
        : "giderlerinin";
  parts.push({ t: ` (${neyin} ${yuzdeIyelik(secPay)}).` });
  return { kind: "answer", parts, rows: [], more: 0, context: baglam(d, p), link: link(d), suggestions: [] };
}

function enBuyuk(d: Durum): Answer {
  const p = donem(d, () => buAy(d));
  const occ = aralikta(d, p.spec);
  if (occ.length === 0) {
    return bos("answer", [...bosCumle(d, p.spec), ...sonKayitIpucu(d, p.spec)], { context: baglam(d, p), link: link(d) });
  }
  const enAz = d.q.direction === "min";
  const sec = occ.reduce((a, b) => {
    const c = b.amount.comparedTo(a.amount);
    return enAz ? (c < 0 ? b : a) : c > 0 ? b : a;
  });
  const sifat = enAz ? "en küçük" : "en büyük";
  const ad = d.q.metric === "income" ? "gelirin" : "harcaman";
  const kat = d.kategoriyle ? "" : ` ${sec.m.categoryName} için`;
  const parts: Part[] = [
    { t: `${ozne(d, p.spec)} ${sifat} ${ad} ${dayPhrase(sec.date, d.now)}${kat} ` },
    { t: d.para(sec.amount), b: true },
    { t: sec.m.note ? ` — “${sec.m.note}”.` : "." },
  ];
  return { kind: "answer", parts, rows: [], more: 0, context: baglam(d, p), link: link(d), suggestions: [] };
}

function gecmisKalemler(d: Durum, spec: TimeSpec): Occ[] {
  return aralikta(d, { ...spec, to: spec.to > d.today ? d.today : spec.to }).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
}

function enSon(d: Durum): Answer {
  const p = donem(d, () => ({ spec: tumZamanlar(d), varsayim: null }));
  const occ = gecmisKalemler(d, p.spec);
  if (occ.length === 0) {
    return bos("answer", bosCumle(d, p.spec), { context: baglam(d, p), link: link(d) });
  }
  const son = occ[0];
  const gelir = d.q.metric === "income";
  const bas = d.filtre ? `${cap(d.filtre)} en son` : "En son";
  const kat = d.kategoriyle ? "" : ` ${son.m.categoryName}${gelir ? ":" : " için"}`;
  const parts: Part[] = [
    { t: `${bas} ${dayPhrase(son.date, d.now)}${kat} ` },
    { t: d.para(son.amount), b: true },
    { t: gelir ? " gelirin oldu" : " harcadın" },
    { t: son.m.note ? ` — “${son.m.note}”.` : "." },
  ];
  return { kind: "answer", parts, rows: [], more: 0, context: p.varsayim ? [p.varsayim, ...d.context] : d.context, link: link(d), suggestions: [] };
}

function sonKayitlar(d: Durum): Answer {
  const p = donem(d, () => ({ spec: tumZamanlar(d), varsayim: null }));
  const occ = gecmisKalemler(d, p.spec);
  const n = d.q.limit ?? 5;
  if (occ.length === 0) {
    return bos("answer", bosCumle(d, p.spec), { context: baglam(d, p), link: link(d) });
  }
  const secilen = occ.slice(0, n);
  const ad = d.q.metric === "income" ? "gelirin" : "harcaman";
  const bas = d.filtre ? `${cap(d.filtre)} son` : "Son";
  return {
    kind: "answer",
    parts: [{ t: `${bas} ${secilen.length} ${ad}:` }],
    rows: secilen.map((o) => kalemSatiri(o, d.now, d.para)),
    more: 0,
    context: d.q.time ? baglam(d, p) : d.context,
    link: link(d),
    suggestions: [],
  };
}

// ---------------------------------------------------------------------------
// Karşılaştırma
// ---------------------------------------------------------------------------

/** Bir dönemin "şimdiki" karşılığı: geçen ay → bu ay, geçen yıl → bu yıl. */
function simdikiKarsilik(spec: TimeSpec, now: Date): TimeSpec {
  if (spec.kind === "month") return thisMonth(now);
  if (spec.kind === "year") return yearSpec(now.getUTCFullYear(), now);
  if (spec.kind === "week" || spec.kind === "weekend") return weekOf(now, "bu hafta");
  if (spec.kind === "day") return todaySpec(now);
  return thisMonth(now);
}

function olcuTutari(d: Durum, spec: TimeSpec): Decimal {
  return d.q.metric === "net" ? netHesap(d, spec).fark : topla(aralikta(d, spec));
}

function karsilastir(d: Durum): Answer {
  const q = d.q;
  let ana: TimeSpec;
  let taban: TimeSpec;
  if (q.time && q.time2) {
    [taban, ana] = q.time.from <= q.time2.from ? [q.time, q.time2] : [q.time2, q.time];
  } else if (q.baseline) {
    taban = q.baseline;
    ana = q.time ?? simdikiKarsilik(q.baseline, d.now);
  } else if (q.time) {
    ana = q.time;
    taban = previousPeriod(q.time, d.now);
  } else {
    ana = thisMonth(d.now);
    taban = monthSpec(d.now.getUTCFullYear(), d.now.getUTCMonth() - 1, d.now);
  }

  const fiil = q.metric === "income" ? "gelirin oldu" : q.metric === "net" ? "biriktirdin" : "harcadın";
  const fiilGecmis = q.metric === "income" ? "gelirin olmuştu" : q.metric === "net" ? "biriktirmiştin" : "harcamıştın";
  const filtre = d.filtre ? ` ${d.filtre}` : "";

  // Süren dönem: bugüne kadarını, tabanın AYNI uzunluktaki başıyla kıyasla.
  // Ayın 13'ünde bu ayı geçen ayın tamamıyla kıyaslamak her zaman "daha az"
  // derdi.
  const suruyor = ana.from <= d.today && d.today <= ana.to && ana.to !== d.today;
  let parts: Part[];
  const ctx: string[] = [];
  if (taban.to < d.ilkTarih) {
    // Taban dönemde hiç kayıt olamaz: "0 TRY harcamıştın, %∞ fazla" demek
    // yerine neden kıyaslanamadığını söyle.
    const a = olcuTutari(d, suruyor ? { ...ana, to: d.today } : ana);
    parts = [
      { t: `${cap(ana.phrase)}${suruyor ? " şimdiye kadar" : ""}${filtre} ` },
      { t: d.para(a), b: true },
      { t: ` ${fiil}. ${cap(taban.phrase)} için kaydın yok — kayıtların ${dayFromPhrase(d.ilkTarih, d.now)} başlıyor, kıyaslayamıyorum.` },
    ];
    return { kind: "answer", parts, rows: [], more: 0, context: d.context, link: link(d), suggestions: [] };
  }
  if (suruyor) {
    const anaKisa = { ...ana, to: d.today };
    const uzunluk = daysBetween(ana.from, d.today);
    const tabanSonu = addDaysKey(taban.from, uzunluk - 1);
    const tabanKisa = { ...taban, to: tabanSonu < taban.to ? tabanSonu : taban.to };
    const a = olcuTutari(d, anaKisa);
    const b = olcuTutari(d, tabanKisa);
    const tamTaban = olcuTutari(d, taban);
    parts = [
      { t: `${cap(ana.phrase)} şimdiye kadar${filtre} ` },
      { t: d.para(a), b: true },
      { t: ` ${fiil}; ${genitive(taban)} aynı günlerinde (${rangeLabel(tabanKisa.from, tabanKisa.to)}) ${d.para(b)} ${fiilGecmis}.` },
      ...degisim(a, b, q.metric),
      { t: ` ${cap(genitive(taban))} tamamı: ${d.para(tamTaban)}.` },
    ];
    ctx.push(`${rangeLabel(anaKisa.from, anaKisa.to)} ile ${rangeLabel(tabanKisa.from, tabanKisa.to)}`);
  } else {
    const a = olcuTutari(d, ana);
    const b = olcuTutari(d, taban);
    parts = [
      { t: `${cap(ana.phrase)}${filtre} ` },
      { t: d.para(a), b: true },
      { t: ` ${fiil}; ${taban.phrase} ${d.para(b)} ${fiilGecmis}.` },
      ...degisim(a, b, q.metric),
    ];
    ctx.push(`${rangeLabel(ana.from, ana.to)} ile ${rangeLabel(taban.from, taban.to)}`);
  }
  if (!q.time && !q.baseline) ctx.push("Zaman belirtmediğin için bu ayı geçen ayla kıyasladım.");
  return { kind: "answer", parts, rows: [], more: 0, context: [...ctx, ...d.context], link: link(d), suggestions: [] };
}

function degisim(a: Decimal, b: Decimal, metric: Metric): Part[] {
  if (b.isZero()) return a.isZero() ? [{ t: " İkisi de sıfır." }] : [];
  const fark = a.minus(b);
  if (fark.isZero()) return [{ t: " Aynı." }];
  const oran = fark.div(b.abs()).mul(100).abs().toNumber();
  const yon = fark.gt(0) ? "daha fazla" : "daha az";
  const ozneSoz = metric === "income" ? "Gelirin" : metric === "net" ? "Birikimin" : "Harcaman";
  return [{ t: ` ${ozneSoz} ` }, { t: `${yuzde(oran)} ${yon}`, b: true }, { t: "." }];
}

// ---------------------------------------------------------------------------
// En çok harcanan ay / gün
// ---------------------------------------------------------------------------

function enIyiDonem(d: Durum): Answer {
  const unit = d.q.unit === "day" ? "day" : "month";
  const p = donem(d, (): Donem =>
    unit === "day"
      ? { spec: { ...thisMonth(d.now), to: d.today }, varsayim: "Zaman belirtmediğin için bu aya baktım." }
      : { spec: last12Months(d.now), varsayim: null }
  );
  const spec = bugune(p.spec, d.today);
  const gruplar = new Map<string, Decimal>();
  if (d.q.metric === "net") {
    for (const o of ac(d.olcuHavuzu, spec.from, spec.to)) {
      const k = unit === "day" ? o.date : o.date.slice(0, 7);
      const v = o.m.direction === "in" ? o.amount : o.amount.neg();
      gruplar.set(k, (gruplar.get(k) ?? new Decimal(0)).plus(v));
    }
  } else {
    for (const o of aralikta(d, spec)) {
      const k = unit === "day" ? o.date : o.date.slice(0, 7);
      gruplar.set(k, (gruplar.get(k) ?? new Decimal(0)).plus(o.amount));
    }
  }
  if (gruplar.size === 0) {
    return bos("answer", bosCumle(d, p.spec), { context: baglam(d, { ...p, spec }), link: link(d) });
  }
  const sirali = [...gruplar.entries()].sort((a, b) => b[1].comparedTo(a[1]));
  const enAz = d.q.direction === "min";
  const [k, v] = enAz ? sirali.at(-1)! : sirali[0];
  const ne = unit === "day" ? dayPhrase(k, d.now) : monthPhrase(k, d.now);
  const fiil = d.q.metric === "income" ? "gelirin oldu" : d.q.metric === "net" ? "biriktirdin" : "harcadın";
  const ozneMetni = cap([p.spec.phrase, d.filtre].filter(Boolean).join(" "));
  return {
    kind: "answer",
    parts: [{ t: `${ozneMetni} en ${enAz ? "az" : "çok"} ` }, { t: ne, b: true }, { t: ` ${fiil}: ` }, { t: d.para(v), b: true }, { t: "." }],
    rows: [],
    more: 0,
    context: [
      rangeLabel(spec.from, spec.to),
      ...(p.varsayim ? [p.varsayim] : []),
      ...(unit === "month" ? [`Karşılaştırılan ${gruplar.size} ay.`] : []),
      ...d.context,
    ],
    link: link(d),
    suggestions: [],
  };
}

// ---------------------------------------------------------------------------
// Bütçe
// ---------------------------------------------------------------------------

function butce(d: Durum, budgets: Budget[], cardLimit: Decimal | null, katlar: CategoryRef[]): Answer {
  const p0 = donem(d, () => ({ spec: thisMonth(d.now), varsayim: null }));
  // Bütçe aylık: verilen zaman ay değilse başladığı ay.
  const ay = p0.spec.kind === "month" ? p0.spec : monthSpec(Number(p0.spec.from.slice(0, 4)), Number(p0.spec.from.slice(5, 7)) - 1, d.now);
  const p: Donem = { spec: ay, varsayim: p0.varsayim };
  const bas = cap(ay.phrase);
  const budgetLink = { href: "/budgets", label: "Bütçeler" };

  // Bütçeler sayfasıyla aynı hesap: harcama tarihi, ayın tamamı.
  const harcanan = (ms: Movement[]) => topla(ac(ms, ay.from, ay.to));

  if (d.q.source === "card") {
    const spent = harcanan(d.ms);
    if (cardLimit === null) {
      return bos("answer", [{ t: "Kart için aylık harcama sınırı koymamışsın. " }, { t: `${bas} kartla ${d.para(spent)} harcadın.` }], {
        context: baglam(d, p),
        link: { href: "/expenses", label: "Kredi kartı sekmesi" },
      });
    }
    return bos("answer", sinirCumlesi(d, `${bas} kart sınırın`, `${bas} kart sınırından`, spent, cardLimit), {
      context: baglam(d, p),
      link: { href: "/expenses", label: "Kredi kartı sekmesi" },
    });
  }

  const limitler = new Map(budgets.map((b) => [b.categoryName, b.limit]));
  const giderHavuzu = d.olcuHavuzu.filter((m) => m.direction === "out" && m.source !== "loan");

  if (katlar.length > 0) {
    const kat = katlar[0].name;
    const limit = limitler.get(kat) ?? null;
    const spent = harcanan(giderHavuzu.filter((m) => m.categoryName === kat));
    if (limit === null) {
      return bos("answer", [{ t: `${kat} için bütçe sınırı koymamışsın. ` }, { t: `${bas} ${kat} için ${d.para(spent)} harcadın.` }], {
        context: baglam(d, p),
        link: budgetLink,
      });
    }
    return bos("answer", sinirCumlesi(d, `${bas} ${kat} bütçen`, `${bas} ${kat} bütçenden`, spent, limit), { context: baglam(d, p), link: budgetLink });
  }

  const sinirli = budgets.filter((b) => b.limit !== null);
  if (sinirli.length === 0) {
    return bos("answer", [{ t: "Henüz hiçbir kategoriye bütçe sınırı koymamışsın." }], {
      link: { href: "/budgets", label: "Bütçe koy" },
    });
  }

  const satirlar = sinirli.map((b) => {
    const spent = harcanan(giderHavuzu.filter((m) => m.categoryName === b.categoryName));
    return { ad: b.categoryName, spent, limit: b.limit!, fark: spent.minus(b.limit!) };
  });
  const toplamLimit = satirlar.reduce((s, r) => s.plus(r.limit), new Decimal(0));
  const toplamHarcanan = satirlar.reduce((s, r) => s.plus(r.spent), new Decimal(0));
  const asanlar = satirlar.filter((r) => r.fark.gt(0)).sort((a, b) => b.fark.comparedTo(a.fark));

  if (d.q.asksRemaining) {
    return bos("answer", sinirCumlesi(d, `${bas} toplam bütçen`, `${bas} toplam bütçenden`, toplamHarcanan, toplamLimit), {
      context: baglam(d, p, `Yalnızca sınır koyduğun ${sinirli.length} kategori.`),
      link: budgetLink,
    });
  }

  if (asanlar.length === 0) {
    const enYakin = satirlar
      .filter((r) => r.limit.gt(0))
      .sort((a, b) => b.spent.div(b.limit).comparedTo(a.spent.div(a.limit)))[0];
    const parts: Part[] = [{ t: `${bas} ` }, { t: "hiçbir kategoride bütçeyi aşmadın", b: true }, { t: "." }];
    if (enYakin) {
      parts.push({ t: ` En yakın: ${enYakin.ad}, sınırın ${yuzdeIyelik(enYakin.spent.div(enYakin.limit).mul(100).toNumber())} kullanıldı.` });
    }
    return bos("answer", parts, { context: baglam(d, p), link: budgetLink });
  }

  return {
    kind: "answer",
    parts: [
      { t: `${bas} ` },
      { t: `${asanlar.length} kategoride bütçeyi aştın`, b: true },
      { t: `: ${ve(asanlar.map((r) => r.ad))}.` },
    ],
    rows: asanlar.map((r) => ({
      label: r.ad,
      detail: `${d.para(r.spent)} / ${d.para(r.limit)}`,
      amount: `+${d.para(r.fark)}`,
    })),
    more: 0,
    context: baglam(d, p),
    link: budgetLink,
    suggestions: [],
  };
}

/**
 * @param ozneMetni Yalın: "Bu ay Market bütçen".
 * @param ozneDen Ayrılma hâli: "Bu ay Market bütçenden". Ek, sözcüğün
 *   sonuna göre değiştiği için ("sınırından", "bütçenden") çağıran veriyor.
 */
function sinirCumlesi(d: Durum, ozneMetni: string, ozneDen: string, spent: Decimal, limit: Decimal): Part[] {
  const kalan = limit.minus(spent);
  const oran = limit.isZero() ? null : spent.div(limit).mul(100).toNumber();
  // "Aştım mı" bir evet/hayır sorusu; cevap onunla başlasın.
  const evetHayir: Part[] = d.q.asksOver ? [{ t: kalan.lt(0) ? "Evet. " : "Hayır. " }] : [];
  if (kalan.lt(0)) {
    return [
      ...evetHayir,
      { t: `${ozneMetni} ` },
      { t: `${d.para(kalan.abs())} aşıldı`, b: true },
      { t: `: ${d.para(spent)} harcandı, sınır ${d.para(limit)}.` },
    ];
  }
  return [
    ...evetHayir,
    { t: `${ozneDen} ` },
    { t: `${d.para(kalan)} kaldı`, b: true },
    { t: oran === null ? "." : `; ${d.para(limit)} sınırın ${yuzdeIyelik(oran)} harcandı.` },
  ];
}

// ---------------------------------------------------------------------------
// Pay, tasarruf oranı, maaş
// ---------------------------------------------------------------------------

function pay(d: Durum): Answer {
  const p = donem(d, () => buAy(d));
  const filtreli = topla(aralikta(d, p.spec));
  const bas = cap(p.spec.phrase);

  // Filtre yoksa "harcamalarım gelirimin yüzde kaçı" sorusu.
  if (!d.filtre) {
    const { gelir, gider } = netHesap(
      { ...d, olcuHavuzu: d.tumu, q: { ...d.q, minAmount: null, maxAmount: null } },
      p.spec
    );
    if (gelir.isZero()) {
      return bos("answer", [{ t: `${bas} gelir kaydın yok; oran hesaplanamıyor.` }], { context: baglam(d, p) });
    }
    return bos(
      "answer",
      [{ t: `${bas} gelirinin ` }, { t: yuzdeBelirtme(gider.div(gelir).mul(100).toNumber()), b: true }, { t: ` harcadın: ${d.para(gelir)} gelirden ${d.para(gider)}.` }],
      { context: baglam(d, p), link: link(d) }
    );
  }

  const payda = topla(esikUygula(d, ac(d.olcuHavuzu.filter((m) => m.source !== "loan" || d.q.source === "loan"), p.spec.from, p.spec.to)));
  if (payda.isZero()) {
    return bos("answer", bosCumle(d, p.spec), { context: baglam(d, p), link: link(d) });
  }
  const oran = filtreli.div(payda).mul(100).toNumber();
  const ne = d.q.metric === "income" ? "gelirinin" : "harcamalarının";
  return bos(
    "answer",
    [
      { t: `${bas} ${ne} ` },
      { t: yuzdeIyelik(oran), b: true },
      { t: ` ${d.filtre}: ${d.para(filtreli)} / ${d.para(payda)}.` },
    ],
    { context: baglam(d, p), link: link(d) }
  );
}

function tasarrufOrani(d: Durum): Answer {
  const p = donem(d, () => ({ spec: thisMonth(d.now), varsayim: "Zaman belirtmediğin için bu ayı aldım." }));
  const { gelir, fark, kredi } = netHesap(d, p.spec);
  const bas = cap(p.spec.phrase);
  const ek = kredi ? ["Kredi taksitleri gidere dahil."] : [];
  if (gelir.isZero()) {
    return bos("answer", [{ t: `${bas} gelir kaydın yok; tasarruf oranı hesaplanamıyor.` }], { context: baglam(d, p, ...ek) });
  }
  const oran = fark.div(gelir).mul(100).toNumber();
  const parts: Part[] =
    fark.gte(0)
      ? [{ t: `${bas} gelirinin ` }, { t: yuzdeBelirtme(oran), b: true }, { t: ` biriktirdin: ${d.para(gelir)} gelirden ${d.para(fark)}.` }]
      : [{ t: `${bas} gelirinden ` }, { t: `${d.para(fark.abs())} fazla harcadın`, b: true }, { t: `; tasarruf oranın eksi ${yuzde(Math.abs(oran))}.` }];
  return bos("answer", parts, { context: baglam(d, p, ...ek), link: link(d) });
}

function maas(d: Durum): Answer {
  const salaryLink = { href: "/salary", label: "Maaş sayfası" };
  let maaslar = d.olcuHavuzu.filter((m) => m.source === "salary");
  // Maaş sayfası kullanılmıyor ama maaş gelir kaydı olarak giriliyorsa
  // ("Diğer Gelir · maaş") onu bul: kullanıcı için ikisi aynı şey.
  if (maaslar.length === 0) {
    const maasMi = (s: string | null) =>
      !!s && normalize(s).split(/[\s\-–—/,.;:()·]+/).some((w) => w.length >= 3 && wordMatches(w, "maas"));
    maaslar = d.tumu.filter((m) => m.direction === "in" && (maasMi(m.note) || maasMi(m.categoryName)));
    if (maaslar.length > 0) {
      const t = d.q.time && d.q.time.kind !== "all" ? d.q.time : null;
      const aday = maaslar
        .filter((m) => m.date <= d.today && (!t || (m.date >= t.from && m.date <= t.to)))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const m = aday[0];
      if (m) {
        return bos(
          "answer",
          [
            { t: t ? `${cap(t.phrase)} maaşın ` : "Son maaşın " },
            { t: d.para(m.amount), b: true },
            { t: ` — ${dayPhrase(m.date, d.now)} girdiğin gelir kaydı.` },
          ],
          { link: { href: "/income", label: "Gelirler sayfası" } }
        );
      }
    }
  }
  if (maaslar.length === 0) {
    return bos("answer", [{ t: "Maaş kaydı bulamadım. Maaş sayfasında çalışma dönemini girince hesaplanıyor." }], {
      link: salaryLink,
    });
  }

  const t = d.q.time;
  // "Ekim maaşım": o ayın HAK EDİŞİ (ödendiği ay değil).
  if (t && t.kind === "month") {
    const ay = t.from.slice(0, 7);
    const m = maaslar.find((x) => x.accrualMonth === ay);
    if (!m) {
      return bos("answer", [{ t: `${monthName(ay, d.now)} maaşın henüz hesaplanmamış.` }], { link: salaryLink });
    }
    return bos("answer", maasCumlesi(d, m, `${monthName(ay, d.now)} maaşın`), { link: salaryLink });
  }

  // Başka bir aralık ("bu yıl maaşlarım"): o aralıkta yatanların toplamı.
  if (t) {
    const spec = t.kind === "all" ? tumZamanlar(d) : t;
    const occ = ac(maaslar, spec.from, spec.to);
    const tutar = topla(occ);
    return bos(
      "answer",
      occ.length === 0
        ? [{ t: `${cap(spec.phrase)} yatan maaş yok.` }]
        : [{ t: `${cap(spec.phrase)} maaş olarak ` }, { t: d.para(tutar), b: true }, { t: ` yattı (${occ.length} ay).` }],
      { context: [rangeLabel(spec.from, spec.to)], link: salaryLink }
    );
  }

  // Zaman yok: en son yatan maaş.
  const yatan = maaslar.filter((m) => m.date <= d.today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const m = yatan[0] ?? [...maaslar].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return bos("answer", maasCumlesi(d, m, "Son maaşın"), { link: salaryLink });
}

function maasCumlesi(d: Durum, m: Movement, ozneMetni: string): Part[] {
  const hakEdis = m.accrualMonth ?? m.date.slice(0, 7);
  const odeme = m.date.slice(0, 7);
  const yatti = m.date <= d.today;
  const ek =
    hakEdis === odeme
      ? ozneMetni.startsWith("Son")
        ? ` (${monthName(hakEdis, d.now)} maaşı).`
        : "."
      : ` (${ozneMetni.startsWith("Son") ? `${monthName(hakEdis, d.now)} maaşı, ` : ""}${monthPhrase(odeme, d.now)} ${yatti ? "yattı" : "yatacak"}).`;
  return [{ t: `${ozneMetni} ` }, { t: d.para(m.amount), b: true }, { t: ek }];
}
