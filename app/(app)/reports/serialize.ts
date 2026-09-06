import Decimal from "decimal.js";

import { buildMetric, type MetricKey, type MetricResult } from "@/lib/reports/metrics";

/**
 * Aylık ham sayılar, sunucu → istemci sınırından geçebilecek biçimde.
 *
 * Decimal nesnesi sınırdan geçemiyor; tutarlar metin taşınıp istemcide
 * yeniden Decimal'e çevriliyor. Sayıya çevirip göndermek büyük tutarlarda
 * hassasiyet kaybederdi.
 */
export type SerializedMonth = {
  month: string;
  income: string;
  expenses: string;
};

export function buildMetricFromSerialized(
  key: MetricKey,
  months: readonly SerializedMonth[]
): MetricResult {
  return buildMetric(
    key,
    months.map((m) => ({
      month: m.month,
      income: new Decimal(m.income),
      expenses: new Decimal(m.expenses),
    }))
  );
}
