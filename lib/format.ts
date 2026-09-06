/**
 * Tüm sayısal/parasal gösterimler için tek biçim: binlik ayraç nokta,
 * ondalık kısım hiç gösterilmez (en yakın tam sayıya yuvarlanır).
 */
export function formatNumber(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(num);
}

/**
 * Tablolarda okunan tarihler. "2026-06" yerine "Haz 2026" — ISO biçimi
 * okurken zihinde ay adına çevrilmek zorunda.
 *
 * ISO metni doğrudan parçalanır, `Date` nesnesine çevrilmez: date-fns'in
 * yerel saatle çalışan yardımcıları negatif ofsetli makinelerde ayı bir
 * geriye kaydırıyor ve "2026-06-01" mayıs olarak görünüyordu.
 *
 * Yalnızca GÖSTERİM içindir. Ay anahtarları, form değerleri, dışa aktarma ve
 * karşılaştırmalar ISO kalmalı.
 */
const MONTHS_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

/** "2026-06" -> "Haz 2026". Tanınmayan girdi olduğu gibi döner. */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;

  const name = MONTHS_SHORT[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : month;
}

/** "2026-06-13" -> "13 Haz 2026". Tanınmayan girdi olduğu gibi döner. */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;

  const name = MONTHS_SHORT[Number(match[2]) - 1];
  if (!name) return date;
  // Baştaki sıfır atılır: "03 Haz" değil "3 Haz".
  return `${Number(match[3])} ${name} ${match[1]}`;
}

/**
 * Varlık adetleri için: kesirli miktarlar (örn. 0.3 ons altın, 0.00042 BTC)
 * yuvarlanıp yok olmasın diye ondalık korunur, ama gereksiz sıfırlar
 * gösterilmez ("2" tam sayıysa "2" olarak kalır).
 */
export function formatQuantity(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 8 }).format(num);
}

/**
 * Parasal tutarlar: tam sayılar ondalıksız gösterilir (1.235 gibi), ama
 * kuruşlu bir tutar girildiyse ondalık korunur — 1.234,56'yı "1.235" diye
 * yuvarlamak girilen veriyi yanlış gösterirdi.
 */
export function formatMoney(value: number | string, currency?: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return currency ? `— ${currency}` : "—";

  const hasFraction = !Number.isInteger(num);
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(num);

  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatSigned(value: number | string, currency?: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  const sign = Number.isFinite(num) && num > 0 ? "+" : "";
  return `${sign}${formatMoney(value, currency)}`;
}

/**
 * Üst özet kutuları için: kuruş hiç gösterilmez.
 *
 * Bu kutulardaki sayılar girilen bir tutar değil, türetilmiş toplamlar
 * (portföy değeri, kâr/zarar, net nakit akışı). Kuruş bir bilgi taşımıyor
 * ama büyük punto başlıkta yer kaplıyor ve okumayı zorlaştırıyor. Tablolarda
 * `formatMoney` kullanılmaya devam ediyor: orada kuruş kullanıcının kendi
 * girdiği veri, yuvarlamak onu yanlış göstermek olurdu.
 */
export function formatMoneyWhole(
  value: number | string,
  currency?: string
): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return currency ? `— ${currency}` : "—";

  const formatted = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(num);

  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatSignedWhole(
  value: number | string,
  currency?: string
): string {
  const num = typeof value === "string" ? Number(value) : value;
  const sign = Number.isFinite(num) && num > 0 ? "+" : "";
  return `${sign}${formatMoneyWhole(value, currency)}`;
}

/**
 * Birim fiyatlar için (Güncel Fiyat, Ort. Maliyet): büyüklüğe göre ondalık
 * basamak sayısı ayarlanır, aksi halde küçük değerli varlıklar (örn. 0.03
 * USD'lik bir kripto) "0" olarak gösterilip anlamsızlaşır.
 */
export function formatPrice(value: number | string, currency?: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";

  const abs = Math.abs(num);
  const maximumFractionDigits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(num);

  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Grafik çubuklarının üstündeki etiketler için kısaltılmış sayı: `92,1B`,
 * `1,3M`. Tam biçim (`92.100`) bitişik iki sütunun etiketini birbirine
 * sokuyordu — kısaltma, yazıyı küçültmeden sığdırmanın tek yolu.
 *
 * Yalnızca grafik etiketinde kullanılır; tablo ve kutulardaki tutarlar tam
 * yazılmaya devam eder, orada basamak bilgi taşıyor.
 *
 * Bin altındaki değerler olduğu gibi yazılır: `840` yerine `0,8B` demek
 * hem daha uzun hem daha az bilgi verirdi.
 */
export function formatCompactNumber(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";

  const sign = num < 0 ? "−" : "";
  const abs = Math.abs(num);

  const tr = (n: number, digits: number) =>
    new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(n);

  // Ölçek ham değere göre seçilir, sonra yuvarlamanın taşırıp taşırmadığına
  // bakılır: 999.960 tek ondalığa yuvarlanınca 1.000,0B olurdu — bu durumda
  // bir üst ölçeğe çıkılır. Ters yönde promosyon YOK: 999 sayısı "1B"
  // değil "999" olarak yazılır, kısaltma orada bilgi kaybından ibaret.
  if (abs >= 1e6) {
    return `${sign}${tr(Math.round((abs / 1e6) * 10) / 10, 1)}M`;
  }
  if (abs >= 1e3) {
    const k = Math.round((abs / 1e3) * 10) / 10;
    return k >= 1000 ? `${sign}${tr(k / 1000, 1)}M` : `${sign}${tr(k, 1)}B`;
  }
  return `${sign}${tr(abs, 0)}`;
}

/**
 * Yüzde gösterimi: `+%1,41`, `-%45,77`.
 *
 * İşaret yüzde imininin ÖNÜNE geliyor. Ham `toFixed` çıktısını başına "%"
 * koyarak yazmak eksi değerlerde `%-45.77` üretiyordu — hem işaret yanlış
 * yerde hem ondalık ayracı nokta, oysa uygulamanın geri kalanı virgül
 * kullanıyor.
 */
export function formatPercent(
  value: number | string,
  { sign = false }: { sign?: boolean } = {}
): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";

  // Eksi imi ASCII tire (U+002D): aynı hücrede üstteki tutar
  // Intl'den bu tireyle geliyor, tipografik "−" kullanmak iki satırı
  // farklı uzunlukta iki çizgiyle gösteriyordu.
  const prefix = num < 0 ? "-" : sign && num > 0 ? "+" : "";
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));

  return `${prefix}%${formatted}`;
}
