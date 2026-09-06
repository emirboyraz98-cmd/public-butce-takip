"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { formatCompactNumber, formatMoney, formatMonth } from "@/lib/format";
import {
  buildMetricFromSerialized,
  type SerializedMonth,
} from "./serialize";
import { METRIC_KEYS, metricTitle, type MetricKey } from "@/lib/reports/metrics";

/**
 * Metrik seçici + grafik.
 *
 * Seçim istemcide tutuluyor: dört metrik de aynı aylık veriden türüyor, her
 * geçişte sunucuya gitmek aynı satırları yeniden çekmek olurdu.
 */
export function MetricChart({
  months,
  currency,
}: {
  months: SerializedMonth[];
  currency: string;
}) {
  const [key, setKey] = useState<MetricKey>("expenses");
  const metric = buildMetricFromSerialized(key, months);

  const isPercent = metric.unit === "percent";
  const fmt = (v: number) =>
    isPercent ? `%${v.toFixed(1)}` : formatMoney(v, currency);

  return (
    <div className="space-y-3">
      {/* Seçici grafiğin ÜSTÜNDE kendi satırında: teslimattaki yer bu ve
          sebebi, seçimin grafiğin başlığını da değiştirmesi. */}
      <div className="border-border flex flex-wrap border">
        {METRIC_KEYS.map((k, i) => (
          <button
            key={k}
            type="button"
            aria-pressed={key === k}
            onClick={() => setKey(k)}
            className={cn(
              "min-h-11 px-3 text-[13px] font-semibold sm:min-h-9",
              i > 0 && "border-border border-l",
              key === k
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {metricTitle(k)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
          {metric.title}
        </h2>
        <p className="text-[13px]">
          <span className="eyebrow mr-1.5 inline">{metric.summaryLabel}</span>
          <strong className="text-[16px]">{fmt(metric.summary)}</strong>
        </p>
      </div>

      {metric.points.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-[13px]">
          Bu aralıkta gösterilecek veri yok.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={metric.points}
            margin={{ top: 22, right: 8, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonth(m).split(" ")[0]}
              tick={{ fontSize: 12 }}
              height={28}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={isPercent ? 42 : 52}
              tickFormatter={(v: number) =>
                isPercent ? `%${Math.round(v)}` : formatCompactNumber(v)
              }
            />
            <Bar dataKey="value" isAnimationActive={false}>
              {/*
                Eksi değerler kırmızı: net nakit akışı ve tasarruf oranı
                eksiye düşebiliyor ve bunu yalnızca çubuğun yönünden
                anlamak, eksenin sıfır çizgisini aramayı gerektiriyordu.
              */}
              {metric.points.map((p) => (
                <Cell
                  key={p.month}
                  fill={
                    p.value < 0
                      ? "var(--chart-expense)"
                      : "var(--foreground)"
                  }
                />
              ))}
              {/* Recharts etiket biçimleyicisine `RenderableText` geçiriyor
                  (number | string | undefined); daraltma burada yapılıyor. */}
              <LabelList
                dataKey="value"
                position="top"
                fontSize={11}
                fontWeight={600}
                formatter={(v: unknown) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return "";
                  return isPercent
                    ? `%${Math.round(n)}`
                    : formatCompactNumber(n);
                }}
                className="fill-foreground"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
