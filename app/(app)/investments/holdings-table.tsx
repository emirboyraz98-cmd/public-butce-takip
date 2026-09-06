"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import {
  formatMoney,
  formatPrice,
  formatQuantity,
  formatPercent,
  formatSigned,
} from "@/lib/format";

export type HoldingRow = {
  key: string;
  symbol: string;
  assetType: string;
  quantity: string;
  avgCostBasis: string;
  currency: string;
  currentPrice: string | null;
  priceCurrency: string | null;
  priceSource: string | null;
  marketValue: string | null;
  unrealizedPL: string | null;
  unrealizedPLPercent: string | null;
  /** Baz para birimine çevrilmiş karşılıklar (toplamlar için). */
  marketValueBase: string | null;
  unrealizedPLBase: string | null;
  realizedPL: string;
  /**
   * Son kaydedilen önceki gün kapanışına göre değişim yüzdesi. Fiyat
   * arşivinde karşılaştırılacak gün yoksa null — "%0" yazmak, fiyatın
   * değişmediğini söylerdi, oysa bilmiyoruz.
   */
  dayChangePercent: string | null;
  /** Aynı değişimin pozisyondaki tutar karşılığı (fiyat para birimi). */
  dayChangeAmount: string | null;
  /** Elde hâlâ adet var mı — tamamen satılmışsa false. */
  isOpen: boolean;
  error?: string | null;
};

type Filter = "open" | "closed" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Açık" },
  { value: "closed", label: "Kapanan" },
  { value: "all", label: "Tümü" },
];

export function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  const [filter, setFilter] = useState<Filter>("open");

  const openCount = holdings.filter((h) => h.isOpen).length;
  const closedCount = holdings.length - openCount;

  const visible = holdings.filter((h) =>
    filter === "all" ? true : filter === "open" ? h.isOpen : !h.isOpen
  );

  if (holdings.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-[13px]">
        Pozisyon yok. İşlem defterinden bir alış ekleyince burada görünecek.
      </p>
    );
  }

  return (
    <div className="@container/holdings">
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {FILTERS.map((f) => {
          const count =
            f.value === "open"
              ? openCount
              : f.value === "closed"
                ? closedCount
                : holdings.length;
          return (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({count})
            </Button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground px-4 pb-6 text-[13px]">
          {filter === "open"
            ? "Açık pozisyon yok — hepsi satılmış."
            : "Kapanmış pozisyon yok."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <ScrollableTable rowCount={visible.length} newestFirst={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Sembol</TableHead>
                {/* Durum yalnızca "Tümü"de bilgi taşıyor; Açık/Kapanan
                    filtresi seçiliyken her satırda aynı şeyi yazıp
                    Kâr/Zarar sütununu ekran dışına itiyordu. */}
                {filter === "all" && <TableHead>Durum</TableHead>}
                <TableHead className="text-right">Adet</TableHead>
                <TableHead className="hidden text-right @xl/holdings:table-cell">
                  Ort. maliyet
                </TableHead>
                <TableHead className="hidden text-right @xl/holdings:table-cell">
                  Güncel
                </TableHead>
                <TableHead className="text-right">Değer</TableHead>
                <TableHead className="text-right">24s</TableHead>
                <TableHead className="text-right">K/Z</TableHead>
                <TableHead className="hidden text-right @5xl/holdings:table-cell">
                  Gerçekleşen
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((h) => (
                <TableRow key={h.key}>
                  <TableCell className="font-medium">
                    {h.symbol}
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      {h.assetType}
                    </span>
                  </TableCell>
                  {filter === "all" && (
                    <TableCell className="text-muted-foreground text-xs">
                      {h.isOpen ? "Açık" : "Kapandı"}
                    </TableCell>
                  )}
                  <TableCell className="text-right whitespace-nowrap">
                    {h.isOpen ? formatQuantity(h.quantity) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right whitespace-nowrap @xl/holdings:table-cell">
                    {h.isOpen ? formatPrice(h.avgCostBasis, h.currency) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right whitespace-nowrap @xl/holdings:table-cell">
                    {!h.isOpen ? (
                      "—"
                    ) : h.currentPrice ? (
                      <span
                        title={
                          h.priceSource ? `Kaynak: ${h.priceSource}` : undefined
                        }
                        className={
                          h.priceSource
                            ? "decoration-muted-foreground/50 cursor-help underline decoration-dotted underline-offset-4"
                            : undefined
                        }
                      >
                        {formatPrice(h.currentPrice, h.priceCurrency ?? undefined)}
                      </span>
                    ) : (
                      <span className="text-destructive text-xs">
                        {h.error ?? "fiyat bulunamadı"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap">
                    {h.marketValue
                      ? formatMoney(h.marketValue, h.priceCurrency ?? undefined)
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right whitespace-nowrap",
                      h.dayChangePercent?.startsWith("-") && "text-destructive"
                    )}
                  >
                    {h.dayChangePercent === null ? (
                      <span
                        className="text-muted-foreground"
                        title="Karşılaştırılacak önceki gün fiyatı yok"
                      >
                        —
                      </span>
                    ) : (
                      <>
                        {/* Tutar üstte, yüzde altta — K/Z sütunuyla aynı
                            sıra. İkisi ters dizildiğinde göz aynı satırda
                            bir kez tutar bir kez yüzde okuyordu. */}
                        {h.dayChangeAmount === null
                          ? formatPercent(h.dayChangePercent, { sign: true })
                          : formatSigned(
                              h.dayChangeAmount,
                              h.priceCurrency ?? undefined
                            )}
                        {h.dayChangeAmount !== null && (
                          <span className="text-muted-foreground block text-[11px] font-normal">
                            {formatPercent(h.dayChangePercent, { sign: true })}
                          </span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell
                    // Artı değer için ayrı bir renk yok: paletde yeşil
                    // bulunmuyor ve işaret zaten tutarın başında (+/−).
                    // Yalnızca zarar vurgulanıyor.
                    className={cn(
                      "text-right whitespace-nowrap",
                      h.unrealizedPL?.startsWith("-") && "text-destructive"
                    )}
                  >
                    {/* Yüzde alt satıra indi: tek satırda tutar +
                        parantezli yüzde, sütunu 90px genişletip tabloyu
                        kabından taşırıyor ve K/Z okunmaz hale geliyordu. */}
                    {h.unrealizedPL ? (
                      <>
                        {formatSigned(
                          h.unrealizedPL,
                          h.priceCurrency ?? undefined
                        )}
                        <span className="text-muted-foreground block text-[11px] font-normal">
                          {formatPercent(h.unrealizedPLPercent ?? 0, {
                            sign: true,
                          })}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "hidden text-right whitespace-nowrap @5xl/holdings:table-cell",
                      h.realizedPL.startsWith("-")
                        ? "text-destructive"
                        : Number(h.realizedPL) === 0 && "text-muted-foreground"
                    )}
                  >
                    {Number(h.realizedPL) === 0
                      ? "—"
                      : formatSigned(h.realizedPL, h.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollableTable>
        </div>
      )}
    </div>
  );
}
