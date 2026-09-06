/**
 * Yığın toplamı etiketlerinin hangi dilime bağlanacağını veriden hesaplar.
 *
 * Neden gerekli: Recharts, değeri sıfır olan bir dilim için hiç dikdörtgen
 * çizmiyor; dolayısıyla o dilime bağlı etiket de hiç render edilmiyor.
 * Toplamı sabit olarak en üstteki seriye bağlarsak, o seri sıfır olduğu
 * aylarda (örn. "Diğer Gelir" yokken) toplam kayboluyor. Etiket içeriğine
 * veri satırı (`payload`) geçmediği için hangi dilimin en üstte olduğu
 * çizim anında da anlaşılamıyor.
 *
 * Çözüm: her dilim için ayrı bir "taşıyıcı" alan üretilir. Toplam yalnızca
 * yığının en üstteki SIFIR OLMAYAN diliminde dolu, diğerlerinde sıfırdır;
 * etiket sıfırı çizmediği için her yığında tam olarak bir toplam görünür.
 */

/** Yığındaki serilerin değerleri, alttan üste sıralı. */
export type StackSlices = readonly number[];

/**
 * Girilen dilimlerle aynı uzunlukta bir dizi döner: en üstteki sıfır olmayan
 * dilimin konumunda toplam, diğerlerinde 0.
 */
export function totalCarriers(slices: StackSlices): number[] {
  const total = slices.reduce((sum, value) => sum + value, 0);
  const carriers = slices.map(() => 0);
  if (total === 0) return carriers;

  for (let i = slices.length - 1; i >= 0; i--) {
    if (slices[i] !== 0) {
      carriers[i] = total;
      return carriers;
    }
  }

  // Toplam sıfır değilken buraya düşülmez; yine de savunmacı davranılır.
  return carriers;
}
