"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { CalcInfo } from "@/components/ui/calc-info";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { formatMoney, formatMonth } from "@/lib/format";
import { setCardStatementPayment } from "./card-payment-actions";

export type LedgerViewRow = {
  month: string;
  openingBalance: string;
  statement: string;
  due: string;
  paid: string;
  isActual: boolean;
  closingBalance: string;
};

/**
 * Kart ekstre defteri: her ay ne kadar borç devretti, ne kadar ödenmesi
 * gerekiyordu, ne kadar ödendi.
 *
 * Ödeme hücresi boş bırakılırsa uygulama "ekstrenin tamamı ödendi" varsayar
 * (eski davranış). Bir tutar girilirse nakit akışı onu kullanır ve ödenmeyen
 * kısım sonraki aya devreder.
 */
export function CardLedger({
  rows,
  currency,
  upcomingTotal,
  assumedAfterCarry = [],
}: {
  rows: LedgerViewRow[];
  currency: string;
  /** İçinde bulunulan aydan sonraki planlı ekstre toplamı (taksitler). */
  upcomingTotal: string;
  /**
   * Devreden borcu olduğu hâlde ödemesi girilmemiş geçmiş aylar. Bu aylarda
   * "tamamı ödendi" varsayımı riskli: yanlışsa devir zinciri sessizce kopar.
   */
  assumedAfterCarry?: { month: string; carried: string }[];
}) {
  if (rows.length === 0) {
    // Boş dönüp çerçeveyi bomboş bırakmak, defterin bozuk olduğunu
    // düşündürüyordu. Harcamaların tamamı ileri bir ekstreye düştüğünde
    // burası gerçekten boş oluyor ve bunu söylemek gerekiyor.
    return (
      <p className="text-muted-foreground py-6 text-center text-[13px]">
        Bu aya kadar ödenmiş ya da devreden bir ekstre yok.
        {Number(upcomingTotal) > 0 && (
          <>
            {" "}
            Planlı ekstre toplamı{" "}
            <strong className="text-foreground">
              {formatMoney(upcomingTotal, currency)}
            </strong>{" "}
            — ilk ekstre kesildiğinde burada görünecek.
          </>
        )}
      </p>
    );
  }

  const last = rows[rows.length - 1];
  const balance = Number(last.closingBalance);

  return (
    <div className="space-y-4">
      {assumedAfterCarry.length > 0 && (
        <p className="border-destructive/50 flex items-start gap-2 border p-3 text-xs">
          <AlertTriangle className="text-destructive mt-px size-3.5 shrink-0" />
          <span>
            {assumedAfterCarry.map((item) => (
              <span key={item.month} className="block">
                <strong>{item.month}</strong> ödemesi girilmedi; bir önceki
                aydan{" "}
                <strong>{formatMoney(item.carried, currency)}</strong> borç
                devrettiği için ekstrenin tamamının ödendiği varsayıldı.
              </span>
            ))}
            <span className="text-muted-foreground mt-1 block">
              O ay da eksik ödediysen gerçek tutarı &quot;Ödenen&quot; sütununa
              gir — yoksa devreden borç olduğundan az görünür ve sonraki
              ayların tamamı yanlış hesaplanır.
            </span>
          </span>
        </p>
      )}

      {balance < 0 && (
        <p className="text-muted-foreground flex items-start gap-2 border p-3 text-xs">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            Ödemelerin kayıtlı harcamaları{" "}
            <strong>{formatMoney(Math.abs(balance), currency)}</strong> aşıyor.
            Bu genelde girilmemiş harcama olduğu anlamına gelir — eksik kayıtları
            eklersen kategori dağılımın da doğru olur. Bu fazlalık sonraki ayın
            borcundan düşülmez.
          </span>
        </p>
      )}

      <div className="overflow-x-auto">
        <ScrollableTable rowCount={rows.length} newestFirst={false}>
          <TableHeader>
            <TableRow>
              <TableHead>Ay</TableHead>
              <TableHead className="text-right">Devreden</TableHead>
              <TableHead className="text-right">Ekstre</TableHead>
              <TableHead className="text-right">
                Ödenecek{" "}
                <CalcInfo title="Ödenecek">
                  <p>Önceki aydan devreden borç + o ayın ekstresi.</p>
                  <p>
                    Ödenmeyen kısım bir sonraki ayın &quot;devreden&quot;
                    sütununa geçer, yani gelecek ay ödenecekmiş gibi
                    hesaplanır.
                  </p>
                </CalcInfo>
              </TableHead>
              <TableHead className="text-right">Ödenen</TableHead>
              <TableHead className="text-right">Kalan borç</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.month}>
                <TableCell>{formatMonth(row.month)}</TableCell>
                <TableCell className="text-muted-foreground text-right">
                  {Number(row.openingBalance) === 0
                    ? "—"
                    : formatMoney(row.openingBalance, currency)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(row.statement, currency)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatMoney(row.due, currency)}
                </TableCell>
                <TableCell className="text-right">
                  <PaymentCell row={row} currency={currency} />
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    Number(row.closingBalance) > 0
                      ? "text-destructive"
                      : Number(row.closingBalance) < 0
                        ? "text-muted-foreground"
                        : ""
                  }`}
                >
                  {formatMoney(row.closingBalance, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ScrollableTable>
      </div>

      {Number(upcomingTotal) > 0 && (
        <p className="text-muted-foreground text-sm">
          Gelecek aylara planlanmış taksitler:{" "}
          <span className="font-medium">
            {formatMoney(upcomingTotal, currency)}
          </span>
          <span className="text-xs">
            {" "}
            — henüz ödenmedikleri için tabloda yer almıyor.
          </span>
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        Ödeme hücresini boş bırakırsan o ay ekstrenin tamamı ödenmiş sayılır.
        Bir tutar girersen Genel Bakış&apos;taki nakit akışı o tutarı kullanır.
        <strong> 0 girmek</strong> &quot;bu ay hiç ödemedim&quot; demektir;
        borcun tamamı devreder.
      </p>
    </div>
  );
}

function PaymentCell({
  row,
  currency,
}: {
  row: LedgerViewRow;
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.isActual ? row.paid : "");
  const [isPending, startTransition] = useTransition();

  function save() {
    const trimmed = value.trim();
    let normalized = "";

    if (trimmed !== "") {
      const parsed = parseDecimalInput(trimmed);
      if (parsed === null || parsed < 0) {
        toast.error("Ödeme 0 veya daha büyük geçerli bir sayı olmalı.");
        return;
      }
      normalized = String(parsed);
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("month", row.month);
      formData.set("currency", currency);
      formData.set("amount", normalized);

      const result = await setCardStatementPayment({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        normalized === "" ? "Ödeme kaydı kaldırıldı." : "Ödeme kaydedildi."
      );
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          type="text"
          inputMode="decimal"
          value={value}
          autoFocus
          placeholder="boş = tamamı"
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-28"
          aria-label={`${row.month} ödenen tutar`}
        />
        <Button size="sm" className="h-8" disabled={isPending} onClick={save}>
          Kaydet
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => {
            setValue(row.isActual ? row.paid : "");
            setEditing(false);
          }}
        >
          Vazgeç
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="hover:bg-accent px-2 py-1 text-right"
    >
      {formatMoney(row.paid, currency)}
      {!row.isActual && (
        <span className="text-muted-foreground ml-1 text-xs">(varsayım)</span>
      )}
    </button>
  );
}
