"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import { paymentMonthOptions } from "@/lib/expenses/creditCard";
import {
  applyCancellation,
  approveAllReady,
  approveImport,
  rejectImport,
} from "./import-actions";

export type PendingImportRow = {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  kind: "PURCHASE" | "CANCELLATION";
  sector: string;
  cardLast4: string;
  installmentCount: number;
  /** Baz para birimine çevrilmiş tutar; kur bulunamadıysa null. */
  amount: string | null;
  currency: string | null;
  /** Mailde yazan özgün tutar — yurt dışı harcamasında farklı. */
  rawAmount: string;
  rawCurrency: string;
  suggestedCategoryId: string | null;
  paymentMonth: string | null;
};

type Draft = { categoryId: string; paymentMonth: string; amount: string };

/**
 * Mailden gelen kayıtların gidere dönüşmeden önce beklediği yer.
 *
 * Doğrudan gider yazmamanın üç sebebi var ve üçü de bu tabloda görünür:
 * bankanın sektörü çözemediği harcamalar kategorisiz geliyor, yurt dışı
 * tutarları çevrilemeyebiliyor ve iptal bildirimleri harcamayla
 * eşleştirilmek zorunda. Onay adımı olmasa bunlar sessizce yanlış veri
 * olarak grafiklere karışırdı.
 */
export function PendingImports({
  rows,
  categories,
}: {
  rows: PendingImportRow[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const draftFor = (row: PendingImportRow): Draft =>
    drafts[row.id] ?? {
      categoryId: row.suggestedCategoryId ?? "",
      paymentMonth: row.paymentMonth ?? "",
      amount: row.amount ?? "",
    };

  const patch = (id: string, row: PendingImportRow, next: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftFor(row), ...next } }));

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Onay bekleyen kayıt yok. Gmail bağlantın kuruluysa yeni kart
        harcamaların buraya düşer.
      </p>
    );
  }

  const readyCount = rows.filter(
    (r) => r.kind === "PURCHASE" && r.amount && r.suggestedCategoryId
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">{rows.length}</strong> kayıt onay
          bekliyor.
          {readyCount > 0 && ` ${readyCount} tanesi elle dokunmadan onaylanabilir.`}
        </p>
        {readyCount > 0 && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => run(() => approveAllReady())}
          >
            Hazır olanları onayla ({readyCount})
          </Button>
        )}
      </div>

      <ScrollableTable rowCount={rows.length}>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>Harcama</TableHead>
            <TableHead>Tutar</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Ekstre ayı</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const draft = draftFor(row);
            const isCancellation = row.kind === "CANCELLATION";
            const converted =
              row.rawCurrency !== (row.currency ?? row.rawCurrency);

            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(row.date)}
                </TableCell>

                <TableCell>
                  <span className="block">{row.sector}</span>
                  <span className="text-muted-foreground text-xs">
                    kart {row.cardLast4}
                    {row.installmentCount > 1 &&
                      ` · ${row.installmentCount} taksit`}
                    {isCancellation && (
                      <strong className="text-destructive"> · İPTAL</strong>
                    )}
                  </span>
                </TableCell>

                <TableCell>
                  {row.amount === null ? (
                    // Kur bulunamadı: uydurulmuş bir tutar yazmak yerine
                    // özgün tutarı gösterip elle girmesini istiyoruz.
                    <div className="space-y-1">
                      <Input
                        value={draft.amount}
                        onChange={(e) =>
                          patch(row.id, row, { amount: e.target.value })
                        }
                        placeholder="TL karşılığı"
                        className="h-8 w-28"
                        inputMode="decimal"
                      />
                      <span className="text-destructive block text-xs">
                        {row.rawAmount} {row.rawCurrency} — kur alınamadı
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="whitespace-nowrap">
                        {formatMoney(Number(row.amount), row.currency ?? undefined)}
                      </span>
                      {converted && (
                        <span className="text-muted-foreground block text-xs">
                          {row.rawAmount} {row.rawCurrency}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  {isCancellation ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <Select
                      value={draft.categoryId}
                      onValueChange={(v) =>
                        patch(row.id, row, { categoryId: v })
                      }
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue placeholder="Seç" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>

                <TableCell>
                  {isCancellation ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <Select
                      value={draft.paymentMonth}
                      onValueChange={(v) =>
                        patch(row.id, row, { paymentMonth: v })
                      }
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue placeholder="Seç" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMonthOptions(row.date).map((m) => (
                          <SelectItem key={m} value={m}>
                            {formatMonth(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>

                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        isCancellation
                          ? applyCancellation(row.id)
                          : approveImport(row.id, {
                              categoryId: draft.categoryId,
                              paymentMonth: draft.paymentMonth,
                              amount: draft.amount || undefined,
                            })
                      )
                    }
                  >
                    {isCancellation ? "İptali uygula" : "Onayla"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={isPending}
                    onClick={() => run(() => rejectImport(row.id))}
                  >
                    Sil
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </ScrollableTable>
    </div>
  );
}
