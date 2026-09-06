/**
 * yyyy-MM ay dizisi yardımcıları. Alan bağımsız: hem kart ekstre defteri
 * hem de aylık analiz grafikleri kesintisiz ay dizisine ihtiyaç duyuyor.
 */

/** İki ay arasındaki kesintisiz dizi (her ikisi dahil). */
export function monthSequence(from: string, to: string): string[] {
  if (from > to) return [];

  const months: string[] = [];
  let cursor = from;
  // Üst sınır: 100 yıl. Bozuk veri sonsuz döngüye sokmasın.
  for (let i = 0; cursor <= to && i < 1200; i++) {
    months.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1));
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return months;
}

/** `month`'tan geriye doğru `count` aylık pencere (sonuncusu `month`). */
export function lastMonths(month: string, count: number): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNum - count, 1));
  const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return monthSequence(from, month);
}
