import { normalize, tokens, wordMatches } from "./text";
import { parseTime, towardsFuture, type TimeSpec } from "./time";

/**
 * Türkçe bir soruyu, veriyle cevaplanabilir bir sorguya çevirir.
 *
 * API anahtarı YOK, dışarı istek YOK: soru dili dar ve veri zaten elimizde,
 * o yüzden kural tabanlı çözümleme yetiyor. Aynı soru her zaman aynı
 * cevabı veriyor ve her kalıp tek tek test edilebiliyor.
 *
 * Çözümleme dört katmanlı ve her katman tanıdığını metinden SİLİYOR:
 *
 *   tutar eşiği → zaman → kaynak (kart/nakit/kredi) → kategori
 *
 * Geriye kalan ve dolgu sözcüğü olmayan sözcükler not araması oluyor
 * ("konser için ne ödedim" → notunda "konser" geçen kayıtlar). Böylece
 * tanınmayan bir sözcük sessizce yok sayılmıyor: soru "konser" hakkındaysa
 * cevap da onun hakkında oluyor ya da "bulamadım" diyor — bütün giderlerin
 * toplamını vermiyor.
 */

export type Metric = "expense" | "income" | "net";

export type Intent =
  /** "ne kadar harcadım" */
  | "total"
  /** "neler aldım", "harcamalarımı listele" */
  | "list"
  /** "kaç kere markete gittim" */
  | "count"
  /** "günlük ortalama", "ayda ortalama" */
  | "average"
  /** "en çok neye harcadım" */
  | "top"
  /** "en büyük harcamam" */
  | "largest"
  /** "en son ne harcadım" */
  | "last"
  /** "son harcamalarım neler" */
  | "recent"
  /** "geçen aya göre" */
  | "compare"
  /** "hangi ay en çok harcadım" */
  | "bestPeriod"
  /** "bütçemi aştım mı" */
  | "budget"
  /** "market yüzde kaç" */
  | "share"
  /** "tasarruf oranım" */
  | "savingsRate"
  /** "maaşım ne kadar" */
  | "salary"
  /** "merhaba", "ne sorabilirim" */
  | "help"
  /** "teşekkürler" */
  | "thanks"
  /** "borsa nasıl", "dolar kaç": bu kutunun kapsamı dışında */
  | "outOfScope";

export type CategoryRef = { name: string; side: "expense" | "income" | "loan" };

export type Source = "card" | "cash" | "loan" | "salary";

export type ParsedQuestion = {
  intent: Intent;
  metric: Metric;
  /** Soruda açıkça geçen zaman; yoksa null — varsayılanı cevap katmanı seçer. */
  time: TimeSpec | null;
  /** Karşılaştırmada ikinci zaman ("eylül ile ekimi karşılaştır"). */
  time2: TimeSpec | null;
  /** Karşılaştırmada "X'e göre" denen dönem (taban). */
  baseline: TimeSpec | null;
  categories: CategoryRef[];
  /** Kategoriye eşleşmeyen, notlarda aranacak sözcükler (katlanmış). */
  noteTerms: string[];
  /** Aynı sözcüklerin kullanıcının yazdığı hâli; cevapta gösterilen. */
  noteLabels: string[];
  source: Source | null;
  minAmount: number | null;
  maxAmount: number | null;
  /** average / bestPeriod için birim. */
  unit: "day" | "week" | "month" | "year";
  /** top / largest / bestPeriod: en çok mu en az mı. */
  direction: "max" | "min";
  /** "ne harcadım" (kalemleri görmek istiyor) — "ne kadar" değil. */
  wantsItems: boolean;
  /** "harcıyorum", "gidiyor": alışkanlık sorusu; zaman yoksa aylık ortalama. */
  habitual: boolean;
  /** "dağılım", "kategorilere göre": kırılım tablosu isteniyor. */
  wantsBreakdown: boolean;
  /** "ne kadar kaldı": bütçede kalan soruluyor, aşım değil. */
  asksRemaining: boolean;
  /** "son 5 harcamam": kaç kalem istendiği. */
  limit: number | null;
  /** "aştım mı": evet/hayır sorusu. */
  asksOver: boolean;
  /** "kart borcum": ekstre borcu soruluyor; harcama toplamıyla aynı şey değil. */
  mentionsDebt: boolean;
  /** "harcayacağım": gelecek zaman; süren dönemde ayın tamamı soruluyor. */
  future: boolean;
};

export type Vocabulary = {
  expenseCategories: string[];
  incomeCategories: string[];
  loans: string[];
};

// ---------------------------------------------------------------------------
// Tutar eşiği: "1000 TL üstü", "500 liradan az". Zamandan ÖNCE çözülüyor;
// yoksa "2000 tl üstü" 2000 yılı sanılırdı.
// ---------------------------------------------------------------------------
const ESIK = new RegExp(
  "\\b(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:\\s*(?:bin))?\\s*(?:tl|try|lira|usd|dolar)?[a-z]*\\s*" +
    "(?:den|dan|ten|tan)?\\s*" +
    "(ustu|uzeri|ustunde|uzerinde|ustundeki|uzerindeki|fazla|buyuk|yukari|yukarisi|asan|alti|altinda|altindaki|az|kucuk|asagi|asagisi)\\b"
);

function esikCoz(text: string): { min: number | null; max: number | null; rest: string } {
  const m = text.match(ESIK);
  if (!m || m.index === undefined) return { min: null, max: null, rest: text };
  let n = Number(m[1].replace(/\./g, ""));
  if (/\bbin\b/.test(m[0])) n *= 1000;
  const ust = /^(ustu|uzeri|ustunde|uzerinde|ustundeki|uzerindeki|fazla|buyuk|yukari|yukarisi|asan)$/.test(m[2]);
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  return ust ? { min: n, max: null, rest } : { min: null, max: n, rest };
}

// ---------------------------------------------------------------------------
// Kaynak: kart / nakit / kredi taksidi / maaş.
// ---------------------------------------------------------------------------
const KAYNAKLAR: { re: RegExp; source: Source }[] = [
  { re: /\bkredi\s*kart[a-z]*|\bkart(?:la|tan|im|imla|imdan|i|a|ta|imin|in)?\b|\bkartla\b/, source: "card" },
  { re: /\bnakit[a-z]*|\bpesin[a-z]*|\bhavale[a-z]*|\beft\b|\bfast\b/, source: "cash" },
  {
    re: /\bkredi[a-z]*(?:\s+(?:taksit|odeme|borc)[a-z]*)?|\btaksit(?!li)[a-z]*|\bborc[a-z]*/,
    source: "loan",
  },
  { re: /\bmaas[a-z]*/, source: "salary" },
];

function kaynakCoz(text: string): { source: Source | null; rest: string } {
  for (const { re, source } of KAYNAKLAR) {
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    // "taksitli" kart alışverişi, kredi değil.
    const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
    return { source, rest };
  }
  return { source: null, rest: text };
}

// ---------------------------------------------------------------------------
// Dolgu: soru kalıbının parçası olan, kategori ya da not araması olmayan
// sözcükler. Liste geniş tutuldu: tanınmayan her sözcük not araması
// sayıldığı için eksik bir dolgu sözcüğü "bulamadım" cevabına yol açar.
// ---------------------------------------------------------------------------
const DOLGU = new Set(
  (
    "ne neye neyi neler nelere neydi nedir nelerdir nereye nerede nereden neden niye nicin nasil " +
    "hangi hangisi hangisine hangisinde hangileri hangilerine kac kaci kacinci kadar kadardir " +
    "mi mu midir mudur miydi muydu misin musun miyim muyum mis " +
    "ben benim bana beni bende benden sen senin sana bizim biz bize " +
    "icin ile ve veya ya yada yahut de da ki bu su o bir iki hem " +
    "en cok az fazla daha toplam toplamda toplami tum butun hep hepsi tane adet " +
    "para parami parayi paranin paramin parayla paralar paralarim lira tl try usd dolar kurus " +
    "gibi olarak olan oldu olur olmus var varmi yok acaba lutfen bak bakar bakalim soyle soyler " +
    "goster gosterir gosterebilir ver verir listele listeler liste acikla hesapla hesaplar " +
    "sey seye seyi seyler seylere seyden icinde arasinda arasi uzerine ait ilgili hakkinda " +
    "simdi su an anda halen hala zaten artik bile sadece yalnizca yalniz " +
    "kategori kategoriye kategorisi kategoriler kategorilere kategoride kategorilerde kategorim " +
    "kalem kalemi kalemler kalemlerim islem islemler islemlerim kayit kayitlar kayitlarim kaydi " +
    "tutar tutari tutarlar miktar miktari rakam rakami " +
    "harcama harcamam harcamalar harcamalarim harcamami harcamalarimi harcamada harcamalarda harcamasi " +
    "gider giderim giderler giderlerim gideri gidere giderimi " +
    "gelir gelirim gelirler gelirlerim geliri gelire gelirimi " +
    "odeme odemem odemeler odemelerim odemesi " +
    "alisveris alisverisim alisverisler alisverislerim alisverise " +
    "masraf masrafim masraflar masraflarim " +
    "durum durumum ozet ozeti rapor raporu dokum dokumu dagilim dagilimi " +
    "gun gunu gunler hafta haftalik ay ayi aylar aylik yil yillik sene " +
    "gunluk gunde haftada ayda yilda ortalama ortalamam ortalamada ortalamasi " +
    "son ilk yeni eski buyuk buyugu pahali yuksek dusuk ucuz kucuk " +
    "kere kez defa sefer siklikla " +
    "butce butcem butcemi butcemden butceyi butcesi butcesinden butcemin limit limitim limitimi limiti sinir siniri sinirim " +
    "yuzde yuzdesi orani oranim oran payi pay " +
    "net kar zarar arti eksi fark farki " +
    "merhaba selam yardim nasilsin naber " +
    "elim elimde elime cebim cebimde cebime is isler islerden isten isimden isinden " +
    "gunlerden aylardan nereler sahip param paramin paramiz kacini kacina kadarini kadari " +
    "zaman zamandir zamanki borc borcum borcu borcum borclarim arasindaki ayindaki"
  ).split(" ")
);

/** Fiiller ve çekimleri: kökle başlayan her sözcük dolgu. */
const FIIL = new RegExp(
  "^(?:" +
    // Kökler bilerek dar: "bil" değil "bilir/biliyor" — "bilet" not araması
    // olabilmeli; "cik" değil "çıktı" — "çikolata" da öyle.
    [
      "harc", "ode", "odu", "odi", "gid", "git(?:t|ti|mis)", "cik(?:t|an|iyor|mis)", "kazan",
      "gel(?:d|ir|en|ecek|iyor|mis)", "biriktir", "birik", "tasarruf",
      "kal(?:d|an|ir|mis|iyor|aca)", "ast", "gec(?:ti|tim|mis|er|iyor)", "yap", "ver(?:d|i[ry]|mis|ecek)",
      "al(?:d|m|i[^ns]|a[^r]|ir|iy|mis|dig|aca|ac)", "karsilastir", "karsila", "kiyasla", "gore",
      "art(?:ti|mis|iyor|is)", "azal", "dus(?:tu|mus|uyor)", "yukse", "sor(?:d|u|ab)", "bil(?:ir|iyor|mek|dir)",
      "ogren", "anlat", "goster", "listele", "say(?:ar|isi|di)", "tut(?:uyor|tu|ar)",
      "ol(?:du|an|ur|mus|acak|arak|sun)", "et(?:ti|tim|mis|mek|iyor)", "ed(?:iyor|ecek|er|in)",
      "yat(?:ti|ir|an|mis|acak)", "butce", "limit", "sinir", "kategori", "ortalama", "toplam", "yuzde",
      "masraf", "alisveris", "islem", "kalem", "kayit", "kayd", "tutar", "miktar", "durum", "harcama",
      "gelir", "odeme", "karsil", "arti(?:da|ya)", "eksi(?:de|ye)", "gir(?:d|di|mis|iyor)",
      "ekle(?:d|mis|di)", "kaydet", "yer(?:im|di)", "ye(?:di|dim|mis)", "ic(?:ti|tim|mis)",
    ].join("|") +
    ")"
);

function dolguMu(t: string): boolean {
  if (DOLGU.has(t)) return true;
  if (/^\d/.test(t)) return true;
  if (t.length < 3) return true;
  return FIIL.test(t);
}

// ---------------------------------------------------------------------------
// Kategori eşleştirme.
// ---------------------------------------------------------------------------
type Aday = { ref: CategoryRef; parts: string[] };

function adaylar(vocab: Vocabulary): Aday[] {
  const out: Aday[] = [];
  const ekle = (name: string, side: CategoryRef["side"]) =>
    out.push({ ref: { name, side }, parts: tokens(normalize(name)).filter((p) => p.length >= 2) });
  for (const n of vocab.expenseCategories) ekle(n, "expense");
  for (const n of vocab.incomeCategories) ekle(n, "income");
  for (const n of vocab.loans) ekle(n, "loan");
  return out;
}

/** Kategori adlarında da geçebilen ama tek başına kategori sayılmaması gereken sözcükler. */
const GENEL_AD = new Set(["diger", "gelir", "geliri", "odeme", "resmi", "ikinci", "el", "kar", "satis", "bagis"]);

function kategoriCoz(
  toks: string[],
  vocab: Vocabulary,
  metricHint: Metric | null
): { categories: CategoryRef[]; used: Set<number>; yalnizKismi: boolean } {
  const used = new Set<number>();
  const secilen: { ref: CategoryRef; skor: number; idx: number[]; tam: boolean }[] = [];

  for (const aday of adaylar(vocab)) {
    const idx: number[] = [];
    let eslesen = 0;
    for (const part of aday.parts) {
      const i = toks.findIndex((t, j) => !idx.includes(j) && wordMatches(t, part));
      if (i >= 0) {
        idx.push(i);
        eslesen++;
      }
    }
    if (eslesen === 0) continue;
    // Yalnızca genel bir sözcükle ("diğer", "gelir") eşleşen ad, adın
    // tamamı yazılmadıysa sayılmıyor: "gelirim" "Kira Geliri" demek değil.
    const ozelEslesme = aday.parts.some(
      (p, k) => !GENEL_AD.has(p) && idx[k] !== undefined && wordMatches(toks[idx[k]], p)
    );
    if (!ozelEslesme && eslesen < aday.parts.length) continue;
    let skor = eslesen / aday.parts.length + eslesen * 0.01;
    // Soru gelir soruyorsa gelir kategorileri, gider soruyorsa gider
    // kategorileri öne geçsin ("kira" → gider "Kira", "kira gelirim" →
    // "Kira Geliri").
    if (metricHint === "income" && aday.ref.side === "income") skor += 0.5;
    if (metricHint !== "income" && aday.ref.side === "expense") skor += 0.05;
    secilen.push({ ref: aday.ref, skor, idx, tam: eslesen === aday.parts.length });
  }

  secilen.sort((a, b) => b.skor - a.skor);
  const categories: CategoryRef[] = [];
  let tamVar = false;
  for (const s of secilen) {
    // Aynı sözcük iki kategoriye birden harcanmasın: önce en iyi eşleşen alır.
    if (s.idx.some((i) => used.has(i))) continue;
    s.idx.forEach((i) => used.add(i));
    categories.push(s.ref);
    if (s.tam) tamVar = true;
  }
  // Yalnızca çok sözcüklü bir adın bir parçası tuttuysa ("borsa" →
  // "Borsa Kâr Realizasyonu") eşleşme zayıf; çağıran başka işaret arıyor.
  return { categories, used, yalnizKismi: categories.length > 0 && !tamVar };
}

// ---------------------------------------------------------------------------
// Niyet ve ölçü.
// ---------------------------------------------------------------------------
function test(re: RegExp, s: string): boolean {
  return re.test(s);
}

const RE = {
  help: /^(?:merhaba|selam|yardim|naber|nasilsin)\b|\bne(?:ler)?\s+(?:sorabilirim|yapabilirsin|biliyorsun)|\bnasil\s+kullan|\bne\s+ise\s+yar|\bneler\s+yapabil|\bsen\s+kimsin/,
  thanks: /^(?:tesekkur|tesekkurler|sagol|sag\s+ol|eyvallah|tamam|super|harika|cok\s+sag\s+ol|eline\s+saglik)\b/,
  outOfScope: /\byatirim|\bportfoy|\bhisse|\bborsa\b|\bkripto|\bbitcoin|\bbtc\b|\b(?:dolar|euro|avro|sterlin|altin|kur)\s+(?:kac|ne\s+kadar|nedir|ne)\b|\bhava\s+durumu/,
  net: /\bkar\s+mi\b|\bzarar\s+mi\b|\bkarda\s+miyim|\bzararda|\bkar\s+zarar|\bbiriktir|\bbirik(?:im|tir)|\btasarruf|\bkenara\b|\bnet\b|\belimde\s+(?:ne\s+kadar\s+)?kal|\bcebimde\s+(?:ne\s+kadar\s+)?kal|\bartida|\beksiye|\beksideyim|\bkar\s+ettim|\bzarar\s+ettim|\bgelir\s+gider\b|\bgelirim\s+giderimi|\bfazla\s+verdim|\bne\s+kadar\s+kaldi\b(?!.*butce)/,
  income: /\bkazan|\bgelir|\bmaas|\bucret|\bprim\b|\btahsil|\bhak\s?edis/,
  /** "geldi", "yattı": gelir de olabilir ("ne kadar para geldi"), fatura da ("faturalar ne geldi"). */
  incomeWeak: /\bgeldi|\bgelen\b|\byatti\b/,
  expense: /\bharc|\bgider|\bmasraf|\bode|\bodu|\bgitti|\bgidiyor|\bgiden\b|\bcikt|\balisveris|\baldim|\bverdim/,
  savingsRate: /\b(?:tasarruf|birikim)\s+oran|\bne\s+kadarini\s+biriktir|\byuzde\s+kacini\s+biriktir|\bgelirimin\s+yuzde\s+kac/,
  share: /\byuzde\s?kac|\byuzdesi|\boran[a-z]*\b|\bpay[a-z]*\b|\bne\s+kadari(?:ni)?\b|%\s?kac/,
  budget: /\bbutce|\blimit|\bsinir[a-z]*\b|\bast(?:im|tim|in|ti|mis)[a-z]*|\bharcayabilir|\bkalan\b|\bne\s+kadar\s+kaldi/,
  compare: /\bkarsilastir|\bkiyasla|\bgore\b|\bfark[a-z]*\b|\bdaha\s+(?:mi\s+|mu\s+)?(?:cok|fazla|az)|\bdaha\s+cok\s+mu|\bart(?:ti|mis|is)|\bazal(?:di|mis|is)|\bdegis/,
  bestPeriod: /\bhangi\s+(?:ay|aylar|hafta|gun)\w*|\ben\s+(?:cok|fazla|az|pahali)\s+(?:\w+\s+){0,3}(?:ay|ayim|aydi|gun|gunum|gundu|hafta|haftam)\b/,
  largest: /\ben\s+(?:buyuk|pahali|yuksek|kucuk|ucuz|dusuk)\b|\ben\s+(?:cok|fazla)\s+para\s+(?:verdigim|odedigim|harcadigim)\s+(?:sey|harcama|alisveris|kalem)/,
  top: /\ben\s+(?:cok|fazla|az)\b|\bnereye\b|\bneye\s+en\b|\bhangi\s+kategori|\bdagilim|\bkategorilere\s+gore|\bkirilim|\bnerelere\b/,
  last: /\ben\s+son\b|\bson\s+(?:harcama|odeme|alisveris|gelir|kayit|islem|masraf)\w*/,
  recentPlural: /\bson\s+(?:harcamalar|odemeler|alisverisler|gelirler|kayitlar|islemler|masraflar)\w*|\ben\s+son\s+\w*\s*(?:neler|harcamalar)|\bson\s+\d+\s+(?:harcama|odeme|kayit|islem)/,
  count: /\bkac\s+(?:kere|kez|defa|sefer|kalem|islem|harcama|kayit|tane|adet|gun|odeme|alisveris)|\bne\s+siklikla|\bkac\s+kere/,
  average: /\bortalama|\bgunluk\b|\bhaftalik\b|\baylik\b|\byillik\b|\bgunde\b|\bhaftada\b|\bayda\b|\byilda\b|\bgun\s+basina|\bay\s+basina/,
  list: /\bneler\b|\blistele|\bliste\b|\bgoster|\bhangi\s+(?:harcama|odeme|alisveris|kayit)|\bne(?:ler)?\s+aldim|\bdetay|\bkalemler|\bdokum|\bnelere\b|\bhangileri/,
  what: /\bne\s+(?:harca|ode|odu|al|ver|gitti|cikti)|\bneye\s+(?:harca|ode|para)|\bneler\b|\bnelere\b/,
  howMuch: /\bne\s+kadar|\bkac\s+(?:para|lira|tl|dolar)|\btoplam|\bmiktar|\btutar/,
  habitual: /\b(?:harciyor|harcar|oduyor|oder|gidiyor|gider\s+mi|kazaniyor|kazanir|biriktiriyor|tutuyor|ediyor)\w*/,
  breakdown: /\bdagilim|\bkategorilere\s+gore|\bkirilim|\bkategori\s+kategori|\bnelere\b|\bnerelere\b/,
};

function birim(s: string): ParsedQuestion["unit"] {
  if (/\bgun|\bgunluk|\bgunde/.test(s)) return "day";
  if (/\bhafta/.test(s)) return "week";
  if (/\byil|\bsene/.test(s)) return "year";
  return "month";
}

function niyet(s: string, source: Source | null): Intent {
  if (test(RE.thanks, s)) return "thanks";
  if (test(RE.help, s)) return "help";
  if (test(RE.savingsRate, s)) return "savingsRate";
  if (test(RE.budget, s) && !/\belimde|\bcebimde/.test(s)) return "budget";
  if (test(RE.share, s)) return "share";
  // "kategorilere göre" bir karşılaştırma değil, kırılım.
  if (test(RE.breakdown, s)) return "top";
  if (test(RE.compare, s)) return "compare";
  if (test(RE.bestPeriod, s)) return "bestPeriod";
  if (test(RE.largest, s)) return "largest";
  if (test(RE.recentPlural, s)) return "recent";
  if (test(RE.last, s)) return "last";
  if (test(RE.count, s)) return "count";
  if (test(RE.top, s)) return "top";
  if (test(RE.average, s)) return "average";
  if (source === "salary") return "salary";
  if (test(RE.list, s)) return "list";
  return "total";
}

function olcu(s: string, intent: Intent, categories: CategoryRef[], source: Source | null): Metric {
  if (intent === "savingsRate") return "net";
  if (intent === "budget") return "expense";
  if (test(RE.net, s)) return "net";
  if (source === "salary") return "income";
  // Harcama fiili açıkça varsa gider; "kira gelirim" gibi gelir kategorisi
  // ya da kazanma fiili varsa gelir.
  if (test(RE.expense, s) && !test(RE.income, s)) return "expense";
  if (test(RE.income, s)) return "income";
  if (categories.length > 0) return categories.every((c) => c.side === "income") ? "income" : "expense";
  if (test(RE.incomeWeak, s)) return "income";
  return "expense";
}

// ---------------------------------------------------------------------------

/**
 * Soruyu çözümler. Hiçbir şey tanınmadıysa `null`: tahmin yürütmek yerine
 * "anlamadım" denmesi için.
 */
export function parseQuestion(raw: string, now: Date, vocab: Vocabulary): ParsedQuestion | null {
  const tam = normalize(raw);
  if (tam === "") return null;

  // 1. Tutar eşiği
  const esik = esikCoz(tam);
  let rest = esik.rest;

  // 2. Zaman — "geçen aya göre" gibi karşılaştırma tabanı da burada çıkıyor.
  let time: TimeSpec | null = null;
  let time2: TimeSpec | null = null;
  let baseline: TimeSpec | null = null;
  // "harcayacağım", "ödeyeceğim": yılı yazılmamış ay önümüzdeki o ay.
  const gelecek = /(?:acag|eceg|acak|ecek)\w*\b/.test(tam) && !/\bgecen\b/.test(tam);
  for (let i = 0; i < 2; i++) {
    const t0 = parseTime(rest, now);
    if (!t0) break;
    const t = gelecek ? { ...t0, spec: towardsFuture(t0.spec, now) } : t0;
    const tabanMi = /^(?:gore|kiyasla|nazaran|oranla)\b/.test(t.after);
    if (tabanMi && !baseline) baseline = t.spec;
    else if (!time) time = t.spec;
    else time2 = t.spec;
    rest = t.rest;
  }

  // Niyet, zaman ifadesi çıkarılmış metinden okunuyor: "son 30 günde"
  // ortalama sorusu, "ayın 5'inde" de bir "ayda" değil.
  const zamansiz = rest;

  // 3. Kaynak
  const kaynak = kaynakCoz(rest);
  rest = kaynak.rest;
  let source = kaynak.source;

  // 4. Niyet ve ölçü ipucu (kategori seçimi gelir/gider ayrımına bakıyor)
  const ipucu: Metric | null = test(RE.income, tam) && !test(RE.expense, tam) ? "income" : null;
  const toks = tokens(rest);
  const kat = kategoriCoz(toks, vocab, ipucu);
  const categories = kat.categories;

  // Kredi adı eşleştiyse kaynak kredi.
  if (categories.some((c) => c.side === "loan")) source = "loan";

  const noteTerms = toks.filter((t, i) => !kat.used.has(i) && !dolguMu(t));
  // Cevapta "yemege" değil "yemeğe" yazsın: katlanmamış sözcüklerle eşle.
  const yazilan = new Map(
    tokens(raw.toLocaleLowerCase("tr").replace(/[’'`´?!,;:"“”().]/g, " ")).map((o) => [normalize(o), o])
  );
  const noteLabels = noteTerms.map((t) => yazilan.get(t) ?? t);

  let intent = niyet(zamansiz, source);
  // "maaş" kategori gibi kullanıldığında ("maaşım ne kadar") ayrı niyet;
  // ama "bu ay maaş dahil ne kazandım" gibi soruda toplam gelir.
  if (intent === "salary" && categories.length > 0) intent = "total";
  // Yatırım, kur, borsa: bu kutu nakit akışını biliyor, piyasayı değil.
  // Kullanıcının bu adda bir kategorisi tam eşleşmediyse kapsam dışı.
  if (test(RE.outOfScope, tam) && (categories.length === 0 || kat.yalnizKismi)) intent = "outOfScope";

  let metric = olcu(tam, intent, categories, source);
  // "Doğalgaz ne kadar geldi": "geldi" faturayı da anlatır. Not araması
  // varsa ve gelire dair güçlü bir sözcük yoksa gider.
  if (metric === "income" && noteTerms.length > 0 && !test(RE.income, tam) && source !== "salary") {
    metric = "expense";
  }
  // "Maaşımın yüzde kaçını harcadım": harcamanın gelire oranı.
  if (intent === "share" && test(RE.expense, tam) && (test(RE.income, tam) || source === "salary")) {
    metric = "expense";
    source = null;
  }

  const tanindi =
    intent !== "total" ||
    time !== null ||
    baseline !== null ||
    categories.length > 0 ||
    source !== null ||
    esik.min !== null ||
    esik.max !== null ||
    test(RE.expense, tam) ||
    test(RE.income, tam) ||
    test(RE.net, tam) ||
    test(RE.howMuch, tam);
  if (!tanindi) return null;

  // Tek işaret, çok sözcüklü bir kategori adının yalnızca bir parçasıysa
  // ("borsa nasıl") soruyu o kategoriyle cevaplamak tahmin olur.
  if (
    kat.yalnizKismi &&
    intent === "total" &&
    time === null &&
    source === null &&
    !test(RE.expense, tam) &&
    !test(RE.income, tam) &&
    !test(RE.howMuch, tam)
  ) {
    return null;
  }

  // Sözcüklerin hiçbiri tanınmadı ve soru bir harcama sorusu da değilse
  // (örn. "hava nasıl"), not araması yapmak yerine anlamadık diyoruz.
  if (
    intent === "total" &&
    time === null &&
    categories.length === 0 &&
    source === null &&
    noteTerms.length > 0 &&
    !test(RE.expense, tam) &&
    !test(RE.income, tam) &&
    !test(RE.howMuch, tam) &&
    !test(RE.what, tam)
  ) {
    return null;
  }

  return {
    intent,
    metric,
    time,
    time2,
    baseline,
    categories,
    noteTerms,
    noteLabels,
    source,
    minAmount: esik.min,
    maxAmount: esik.max,
    unit: birim(rest),
    direction: /\ben\s+(?:az|kucuk|ucuz|dusuk)\b/.test(tam) ? "min" : "max",
    wantsItems: test(RE.list, tam) || (test(RE.what, tam) && !test(RE.howMuch, tam)),
    habitual: test(RE.habitual, tam),
    wantsBreakdown: test(RE.breakdown, tam),
    asksRemaining: /\bkal(?:d|an)|\bharcayabilir/.test(tam),
    asksOver: /\bast(?:im|tim|in|ti|mis)/.test(tam),
    mentionsDebt: /\bborc/.test(tam),
    future: gelecek,
    limit: (() => {
      const m = tam.match(/\bson\s+(\d{1,2})\s+(?:harcama|odeme|alisveris|kayit|islem|gelir|masraf)/);
      return m ? Math.min(Number(m[1]), 30) : null;
    })(),
  };
}
