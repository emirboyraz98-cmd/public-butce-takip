"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { formatMonth, formatNumber } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/investments/monthlySeries";

type View = "value" | "pl";

const VIEWS: { value: View; label: string }[] = [
  { value: "value", label: "Toplam Değer" },
  { value: "pl", label: "Toplam Kâr/Zarar" },
];

/**
 * Portföyün aydan aya seyri. İki görünüm var:
 *
 * - Toplam Değer: o ay sonundaki piyasa değeri, referans olarak yatırılan
 *   maliyetle birlikte (aradaki fark kâr/zarardır).
 * - Toplam Kâr/Zarar: gerçekleşen (satılmış) ve toplam (gerçekleşen +
 *   kâğıt üstündeki) kâr/zarar.
 *
 * Fiyat arşivi bulunmayan aylarda piyasa değeri çizilmez (çizgi kesilir) —
 * bugünün fiyatını geçmişe uygulamak yanıltıcı olurdu. Maliyet ve
 * gerçekleşen kâr/zarar ise işlem defterinden türediği için her ay kesindir.
 */
export function PortfolioTrendChart({
  data,
  currency,
}: {
  data: MonthlyPoint[];
  currency: string;
}) {
  const [view, setView] = useState<View>("value");

  if (data.length < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Seyri görebilmek için en az iki aylık veri gerekiyor.
      </p>
    );
  }

  const missingValueMonths = data.filter((d) => d.marketValue === null).length;

  const tooltipStyle = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--popover-foreground)",
    fontSize: 12,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <Button
            key={v.value}
            type="button"
            size="sm"
            variant={view === v.value ? "default" : "outline"}
            onClick={() => setView(v.value)}
          >
            {v.label}
          </Button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={80} />
          <Tooltip
            labelFormatter={(label) => formatMonth(String(label))}
            formatter={(value) =>
              value === null ? "veri yok" : `${formatNumber(Number(value))} ${currency}`
            }
            contentStyle={tooltipStyle}
          />
          <Legend />
          {view === "value" ? (
            <>
              <Line
                type="monotone"
                dataKey="marketValue"
                name="Piyasa Değeri"
                stroke="var(--series-1)"
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="costBasis"
                name="Yatırılan Maliyet"
                stroke="var(--series-4)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </>
          ) : (
            <>
              <ReferenceLine y={0} className="stroke-border" strokeWidth={1} />
              <Line
                type="monotone"
                dataKey="totalPL"
                name="Toplam K/Z"
                stroke="var(--series-1)"
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="realizedPL"
                name="Gerçekleşen K/Z"
                stroke="var(--series-3)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>

      {missingValueMonths > 0 && (
        <p className="text-muted-foreground text-xs">
          {missingValueMonths} ay için fiyat arşivi yok, o aylarda piyasa
          değeri çizgisi kesiliyor. Fiyat geçmişi bugünden itibaren günlük
          kaydediliyor; grafik zamanla dolacak.{" "}
          <strong>Yatırılan maliyet</strong> ve{" "}
          <strong>gerçekleşen kâr/zarar</strong> işlem defterinden hesaplandığı
          için geçmiş aylarda da doğrudur.
        </p>
      )}
    </div>
  );
}
