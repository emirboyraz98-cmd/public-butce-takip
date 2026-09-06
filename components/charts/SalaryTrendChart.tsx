"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMonth, formatNumber } from "@/lib/format";

export type SalaryPoint = {
  month: string;
  /** Formüle göre hesaplanan tutar. */
  hesaplanan: number;
  /** Kullanıcının girdiği gerçekleşen ödeme (girilmemişse null). */
  gerçekleşen: number | null;
};

/**
 * Aylık maaşın zaman içindeki değişimi. Hesaplanan ve (girildiyse)
 * gerçekleşen ödeme birlikte gösterilir ki aradaki fark görülebilsin.
 * İki seri de aynı para biriminde olduğu için tek eksen kullanılır.
 */
export function SalaryTrendChart({
  data,
  currency,
}: {
  data: SalaryPoint[];
  currency: string;
}) {
  if (data.length < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Değişimi görebilmek için en az iki aylık sonuç gerekiyor.
      </p>
    );
  }

  const hasActual = data.some((d) => d.gerçekleşen !== null);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={70} />
        <Tooltip
          labelFormatter={(label) => formatMonth(String(label))}
          formatter={(value) =>
            value === null ? "—" : `${formatNumber(Number(value))} ${currency}`
          }
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--popover-foreground)",
            fontSize: 12,
          }}
        />
        {hasActual && <Legend />}
        <Line
          type="monotone"
          dataKey="hesaplanan"
          name="Hesaplanan"
          stroke="var(--series-1)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
        />
        {hasActual && (
          <Line
            type="monotone"
            dataKey="gerçekleşen"
            name="Gerçekleşen"
            stroke="var(--series-3)"
            strokeWidth={2}
            strokeDasharray="5 4"
            // Gerçekleşen ödeme girilmemiş aylarda çizgi kesilir; boşluğu
            // birleştirmek, olmayan bir ödemeyi varmış gibi gösterirdi.
            connectNulls={false}
            dot={{ r: 4, fill: "var(--series-3)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
