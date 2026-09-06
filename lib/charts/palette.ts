/**
 * Kategorik seri renkleri. Sıra sabittir ve döngüye sokulmaz: 8'den fazla
 * dilim olduğunda kalanlar "Diğer" altında toplanır (bkz. foldToTopN).
 * Renk değerleri globals.css'teki --series-* token'larından gelir; böylece
 * açık/koyu temada zemine göre doğru basamak kullanılır.
 */
export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const MAX_SERIES = SERIES_COLORS.length;

/** Rengi entiteye göre verir — sıralamaya göre değil, ki filtrelemede kaymasın. */
export function colorForIndex(index: number): string {
  return SERIES_COLORS[index % MAX_SERIES];
}

export type Slice = { name: string; value: number };

/**
 * Palet 8 renkle sınırlı olduğundan, daha fazla kategori varsa en büyük
 * (MAX_SERIES - 1) tanesi korunur, geri kalanı tek bir "Diğer" diliminde
 * toplanır. Böylece renk üretmek ya da paleti döngüye sokmak gerekmez.
 */
export function foldToTopN(
  slices: Slice[],
  maxSlices: number = MAX_SERIES
): Slice[] {
  const positive = slices.filter((s) => s.value > 0);
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  if (sorted.length <= maxSlices) return sorted;

  const kept = sorted.slice(0, maxSlices - 1);
  const rest = sorted.slice(maxSlices - 1);
  const otherTotal = rest.reduce((sum, s) => sum + s.value, 0);

  return [...kept, { name: `Diğer (${rest.length})`, value: otherTotal }];
}
