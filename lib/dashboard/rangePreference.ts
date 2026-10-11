/**
 * Genel Bakış'ta seçilen tarih aralığı, sekmeler arasında gezinince
 * kaybolmasın diye bir çerezde saklanır. Çerez sunucu tarafında okunduğu için
 * sayfa doğrudan doğru aralıkla render edilir; önce varsayılan aralık görünüp
 * sonra zıplama olmaz.
 *
 * Saklama bilerek OTURUM boyuncadır: çerezin son kullanma tarihi yoktur, yani
 * tarayıcı kapanınca silinir; ayrıca giriş ve çıkışta da temizlenir. Böylece
 * her yeni girişte varsayılan "son 6 ay" gelir ve seçim bayatlamaz — kasımda
 * hâlâ mart–ağustos açılması gibi bir durum oluşmaz.
 */
export const RANGE_COOKIE = "dashboard-range";

/** yyyy-MM biçimi ve makul bir yıl aralığı. */
function isValidMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export type MonthRangePreference = { from: string; to: string };

/**
 * Varsayılan pencere: içinde bulunulan ay dahil 3 ay geri, 3 ay ileri.
 *
 * `BACK = 2` üç ay demek, çünkü içinde bulunulan ay da sayılıyor —
 * arayüzdeki "Son 3 ay" düğmesi de aynı hesapla çalışıyor. İkisi aynı
 * olduğu için sayfa ilk açıldığında "+3 ay" düğmesi seçili görünür;
 * farklı olsalardı hiçbir düğme vurgulanmaz, aralık nereden geldiği
 * belirsiz dururdu.
 */
export const DEFAULT_RANGE_BACK_MONTHS = 2;
export const DEFAULT_RANGE_FORWARD_MONTHS = 3;

/**
 * Hiçbir seçim yokken gösterilecek aralık: 3 ay geri + 3 ay ileri.
 *
 * Eskiden yalnızca geriye bakıyordu (son 6 ay). Oysa uygulamanın anlattığı
 * şeyin yarısı ileriye dönük: kredi taksitleri, kart ekstreleri ve
 * tekrarlayan giderler gelecek aylara yazılıyor. Varsayılan geçmişle
 * sınırlıyken "önümüzdeki aylarda ne çıkacak" sorusu ancak düğmeye
 * basılırsa görünüyordu.
 *
 * Sabit tarihler değil, `now`'a göre kayan bir penceredir: kasımda açılınca
 * eylül–şubat gelir. Bu yüzden seçim de kalıcı saklanmaz — kalıcı olsaydı
 * ağustosta seçilen aralık kasımda da açılır, pencere geride kalırdı.
 */
export function defaultRange(now: Date): MonthRangePreference {
  const year = now.getFullYear();
  const month = now.getMonth();
  const asMonth = (y: number, m: number) =>
    // Date.UTC ay taşmasını kendi çözer (ocakta -2 ay -> önceki yılın kasımı).
    new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  return {
    from: asMonth(year, month - DEFAULT_RANGE_BACK_MONTHS),
    to: asMonth(year, month + DEFAULT_RANGE_FORWARD_MONTHS),
  };
}

export function serializeRange(range: MonthRangePreference): string {
  return `${range.from}_${range.to}`;
}

/**
 * Çerez içeriği kullanıcı tarafından değiştirilebildiği için biçim ve
 * mantık (başlangıç <= bitiş) doğrulanır; geçersizse null döner ve çağıran
 * varsayılana düşer.
 */
export function parseRange(raw: string | undefined): MonthRangePreference | null {
  if (!raw) return null;

  const [from, to] = raw.split("_");
  if (!from || !to) return null;
  if (!isValidMonth(from) || !isValidMonth(to)) return null;
  if (from > to) return null;

  return { from, to };
}

/**
 * Seçimi tarayıcı çerezine yazar. Sunucu bu çerezi okuyup varsayılan olarak
 * kullandığı için sayfa doğrudan doğru aralıkla açılır; önce varsayılan
 * aralık görünüp sonra zıplama olmaz.
 *
 * `max-age`/`expires` bilerek verilmez: böylece oturum çerezi olur ve tarayıcı
 * kapanınca kendiliğinden silinir.
 *
 * Modül seviyesinde durur: `document` yazımı bileşen gövdesinde yapılırsa
 * React Compiler bunu render sırasında yan etki sayıp uyarıyor.
 */
export function rememberRange(range: MonthRangePreference): void {
  if (typeof document === "undefined") return;
  document.cookie = `${RANGE_COOKIE}=${serializeRange(range)}; path=/; samesite=lax`;
}

/**
 * Saklanan aralığı siler; sonraki açılış varsayılan son 6 aya döner.
 * Giriş ve çıkışta çağrılır, böylece her yeni oturum temiz başlar.
 */
export function forgetRange(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${RANGE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
