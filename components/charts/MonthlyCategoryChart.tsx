"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney, formatMonth, formatNumber } from "@/lib/format";

export type MonthlyPoint = { month: string; value: number };

/**
 * Bir kategorinin (ya da tümünün) aylara dağılımı.
 *
 * Pasta grafik "bu ay parayı neye verdim" sorusunu cevaplıyor ama "yemeğe
 * aylar içinde ne kadar veriyorum" sorusuna cevap veremiyordu; zaman ekseni
 * yoktu. Bu grafik tam olarak onu gösterir.
 *
 * Tek seri olduğu için renk ayırt edici kanal değil: her sütunun değeri
 * üstüne yazılır ve eksen aylarla etiketlidir.
 */
export function MonthlyCategoryChart({
  data,
  currency,
  height = 300,
  emptyMessage = "Seçilen aralıkta kayıt yok.",
}: {
  data: MonthlyPoint[];
  currency: string;
  height?: number;
  emptyMessage?: string;
}) {
  const total = data.reduce((sum, point) => sum + point.value, 0);
  if (data.length === 0 || total <= 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  const average = total / data.length;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={54}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            labelFormatter={(label) => formatMonth(String(label))}
            formatter={(value) => [formatMoney(Number(value), currency), "Harcama"]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="value" content={BarValueLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-muted-foreground text-sm">
        Toplam:{" "}
        <span className="text-foreground font-medium">
          {formatMoney(total, currency)}
        </span>{" "}
        · Aylık ortalama:{" "}
        <span className="text-foreground font-medium">
          {formatMoney(average, currency)}
        </span>
      </p>
    </div>
  );
}

/** Sıfır aylarda etiket yazılmaz; boş sütunun üstünde "0" gürültü olurdu. */
function BarValueLabel(props: unknown) {
  const p = props as {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    value?: unknown;
  };
  const value = Number(p.value);
  if (!value) return null;

  return (
    <text
      x={Number(p.x) + Number(p.width) / 2}
      y={Number(p.y) - 6}
      textAnchor="middle"
      fontSize={11}
      style={{ fill: "var(--foreground)" }}
    >
      {formatNumber(value)}
    </text>
  );
}
