import Decimal from "decimal.js";

/** Bir ayın rapor için gereken ham sayıları. */
export type ReportMonth = {
  /** yyyy-MM */
  month: string;
  income: Decimal;
  expenses: Decimal;
};

export type MetricKey = "savingsRate" | "expenses" | "income" | "net";

export type MetricPoint = { month: string; value: number };

export type MetricResult = {
  key: MetricKey;
  title: string;
  /** Kutuda gösterilecek özet sayı; biçimlenmemiş ham değer. */
  summary: number;
  summaryLabel: string;
  /** Değerler yüzde mi para mı — biçimleme buna bakar. */
  unit: "percent" | "currency";
  points: MetricPoint[];
};

const TITLES: Record<MetricKey, string> = {
  savingsRate: "Tasarruf oranı",
  expenses: "Giderler",
  income: "Gelirler",
  net: "Net nakit akışı",
};

export const METRIC_KEYS: MetricKey[] = [
  "savingsRate",
  "expenses",
  "income",
  "net",
];

export function metricTitle(key: MetricKey): string {
  return TITLES[key];
}

/**
 * Tasarruf oranı: (gelir − gider) / gelir.
 *
 * Gelirin sıfır olduğu ay oranı tanımsız bırakır. Sıfır yazmak "hiç tasarruf
 * edilmedi" derdi; oysa o ay hiç gelir yok, oran hesaplanamıyor.
 */
export function savingsRate(month: ReportMonth): number | null {
  if (month.income.isZero()) return null;
  return month.income
    .minus(month.expenses)
    .div(month.income)
    .times(100)
    .toNumber();
}

/**
 * Seçilen metriği aylık seriye çevirir.
 *
 * Dört metrik tek yerde: metrik değiştiğinde başlık, birim ve özet sayı
 * BİRLİKTE değişmeli. Ayrı ayrı yazıldıklarında grafik "Giderler" derken
 * özet hâlâ gelirin toplamını gösterebiliyordu.
 */
export function buildMetric(
  key: MetricKey,
  months: readonly ReportMonth[]
): MetricResult {
  if (key === "savingsRate") {
    const points: MetricPoint[] = [];
    for (const m of months) {
      const rate = savingsRate(m);
      // Gelirsiz ay seriye hiç girmiyor: sıfır çizmek, o ayda her şeyin
      // harcandığı izlenimi verirdi.
      if (rate !== null) points.push({ month: m.month, value: rate });
    }
    const avg =
      points.length === 0
        ? 0
        : points.reduce((a, p) => a + p.value, 0) / points.length;
    return {
      key,
      title: TITLES[key],
      summary: avg,
      summaryLabel: "dönem ortalaması",
      unit: "percent",
      points,
    };
  }

  const value = (m: ReportMonth) =>
    key === "expenses"
      ? m.expenses.toNumber()
      : key === "income"
        ? m.income.toNumber()
        : m.income.minus(m.expenses).toNumber();

  const points = months.map((m) => ({ month: m.month, value: value(m) }));

  return {
    key,
    title: TITLES[key],
    summary: points.reduce((a, p) => a + p.value, 0),
    summaryLabel: "dönem toplamı",
    unit: "currency",
    points,
  };
}
