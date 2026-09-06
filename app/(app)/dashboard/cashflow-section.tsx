"use client";

import { useState } from "react";

import {
  CashFlowChart,
  type CashFlowPoint,
  type CashFlowView,
} from "@/components/charts/CashFlowChart";
import { cn } from "@/lib/utils";
import { BreakdownPanel } from "./breakdown-panel";
import { CategoryBars, type CategoryShare } from "./category-bars";

export type CategoryAmount = { category: string; amount: string };

/** Kalemler geldikleri yere göre gruplanır; sıra sabittir. */
export type SourceGroup = {
  source: string;
  total: string;
  items: CategoryAmount[];
};

export type MonthDetail = {
  month: string;
  incomeGroups: SourceGroup[];
  expenseGroups: SourceGroup[];
  /** Kaynak ayrımı olmadan, kategori bazında harcama payları. */
  expenseByCategory: CategoryShare[];
};

const VIEWS: { value: CashFlowView; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "income", label: "Sadece gelir" },
  { value: "expenses", label: "Sadece gider" },
];

/**
 * Grafik ve seçili ayın dökümü tek bir durumu paylaşır: sütuna tıklamak
 * sağdaki paneli o aya sabitler.
 *
 * Döküm eskiden grafiğin ALTINDAYDI ve ekranın altına düşüyordu; sütuna
 * tıklayınca değiştiği görülmüyordu bile. Yan sütunda ikisi aynı anda
 * görünüyor.
 */
export function CashflowSection({
  data,
  details,
  baseCurrency,
  currentMonth,
  note,
}: {
  data: CashFlowPoint[];
  details: MonthDetail[];
  baseCurrency: string;
  /** yyyy-MM — grafikte kalın yazılıp zeminle vurgulanır. */
  currentMonth: string;
  /** Kur/maaş gecikmesi gibi aralığa özel açıklamalar. */
  note?: React.ReactNode;
}) {
  // Açılışta içinde bulunulan ay seçili; aralık bu ayı kapsamıyorsa son ay.
  const [selectedMonth, setSelectedMonth] = useState(
    data.find((d) => d.month === currentMonth)?.month ??
      data[data.length - 1]?.month
  );
  const [view, setView] = useState<CashFlowView>("all");

  const detail = details.find((d) => d.month === selectedMonth);
  const selectedPoint = data.find((d) => d.month === selectedMonth);

  const showIncome = view === "all" || view === "income";
  const showExpenses = view === "all" || view === "expenses";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="border-border flex min-w-0 flex-col border">
        <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b-2 px-4 py-3">
          <div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
              Nakit Akışı
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
              {note}
            </p>
          </div>
          <div className="border-border flex flex-none border">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                aria-pressed={view === v.value}
                className={cn(
                  "min-h-11 px-3 text-[13px] font-semibold sm:min-h-9",
                  "border-border border-l first:border-l-0",
                  view === v.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-w-0 px-2 py-3">
          <CashFlowChart
            data={data}
            baseCurrency={baseCurrency}
            currentMonth={currentMonth}
            view={view}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        </div>

        <p className="text-muted-foreground border-border mt-auto border-t px-4 py-2.5 text-[12px] leading-snug">
          Çubukların üstünde aylık toplamlar, eksenin altında o ayın neti
          yazar. Bir sütunun üzerine gelince <strong>kalem kalem</strong>{" "}
          dökümü balonda çıkar; <strong>tıklarsan</strong> yandaki döküm o aya
          sabitlenir. İçi boş çubuklar projeksiyondur.
        </p>
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        {detail && selectedPoint && (
          <>
            <BreakdownPanel
              month={detail.month}
              incomeGroups={detail.incomeGroups}
              expenseGroups={detail.expenseGroups}
              net={selectedPoint.net}
              currency={baseCurrency}
              projected={selectedPoint.projected}
              showIncome={showIncome}
              showExpenses={showExpenses}
            />
            {showExpenses && (
              <CategoryBars
                month={detail.month}
                items={detail.expenseByCategory}
                currency={baseCurrency}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
