"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { formatMoneyWhole, formatMonth } from "@/lib/format";
import type { SourceGroup } from "./cashflow-section";

/**
 * Seçili ayın kalem dökümü.
 *
 * Kaynak başlıkları (Maaş, Kredi Kartı, Krediler…) her zaman görünür;
 * altlarındaki kategoriler başlıktaki +/− kutusuyla açılıp kapanıyor.
 * Önceden hepsi birden açıktı ve sekiz kredi taksiti olan bir ayda döküm
 * grafikten uzun oluyordu; kaynak toplamı zaten başlıkta yazdığı için
 * ayrıntı çoğu zaman gerekmiyor.
 *
 * Tek kalemli kaynakta açma düğmesi çıkmıyor: açınca başlıktakiyle aynı
 * rakamı tekrar eden tek satır görünürdü.
 */
function Row({
  group,
  currency,
  negative,
}: {
  group: SourceGroup;
  currency: string;
  negative: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expandable = group.items.length > 1;

  const amount = negative
    ? `−${formatMoneyWhole(Math.abs(Number(group.total)), currency)}`
    : formatMoneyWhole(group.total, currency);

  const header = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {expandable ? (
          <span
            aria-hidden
            className="border-border flex size-[18px] flex-none items-center justify-center border text-[13px] leading-none font-bold"
          >
            {open ? "−" : "+"}
          </span>
        ) : (
          <span aria-hidden className="size-[18px] flex-none" />
        )}
        <span className="truncate">{group.source}</span>
        {expandable && (
          <span className="text-muted-foreground flex-none text-[12px]">
            ({group.items.length})
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex-none font-semibold",
          negative ? "text-destructive" : "text-foreground"
        )}
      >
        {amount}
      </span>
    </>
  );

  return (
    <div>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="hover:bg-muted flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px]"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
          {header}
        </div>
      )}

      {open && (
        <ul className="pb-2">
          {group.items.map((item) => (
            <li
              key={item.category}
              className="text-muted-foreground flex items-center justify-between gap-3 px-4 py-1 pl-[42px] text-[13px]"
            >
              <span className="truncate">{item.category}</span>
              <span className="flex-none">
                {negative
                  ? `−${formatMoneyWhole(Math.abs(Number(item.amount)), currency)}`
                  : formatMoneyWhole(item.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BreakdownPanel({
  month,
  incomeGroups,
  expenseGroups,
  net,
  currency,
  projected,
  showIncome,
  showExpenses,
}: {
  month: string;
  incomeGroups: SourceGroup[];
  expenseGroups: SourceGroup[];
  net: number;
  currency: string;
  projected?: boolean;
  showIncome: boolean;
  showExpenses: boolean;
}) {
  const rows = [
    ...(showIncome ? incomeGroups.map((g) => ({ g, negative: false })) : []),
    ...(showExpenses ? expenseGroups.map((g) => ({ g, negative: true })) : []),
  ];

  return (
    <section className="border-border border">
      <header className="border-border border-b-2 px-4 py-3">
        <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">
          {formatMonth(month)} dökümü
        </h2>
        {projected && (
          <p className="text-muted-foreground mt-0.5 text-[12px]">
            Projeksiyon — yalnızca tekrarlayan kayıtlar
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-[13px]">
          Bu ay için kayıt yok.
        </p>
      ) : (
        <div className="divide-hairline">
          {rows.map(({ g, negative }) => (
            <Row
              key={`${negative ? "e" : "i"}-${g.source}`}
              group={g}
              currency={currency}
              negative={negative}
            />
          ))}
        </div>
      )}

      {/* Net yalnızca iki taraf da görünürken anlamlı; tek taraf
          filtrelendiğinde o tarafın toplamı sanılırdı. */}
      {showIncome && showExpenses && (
        <div className="border-border flex items-center justify-between gap-3 border-t-2 px-4 py-3 text-[14px]">
          <span className="font-extrabold">Net</span>
          <span
            className={cn(
              "font-extrabold",
              net < 0 ? "text-destructive" : "text-foreground"
            )}
          >
            {net < 0
              ? `−${formatMoneyWhole(Math.abs(net), currency)}`
              : `+${formatMoneyWhole(net, currency)}`}
          </span>
        </div>
      )}
    </section>
  );
}
