"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney, formatMonth } from "@/lib/format";
import { deleteBaseSalaryRate } from "./actions";
import { BaseSalaryRateForm } from "./base-salary-rate-form";

export type BaseSalaryRateRow = {
  id: string;
  amount: string;
  currency: "TRY" | "USD";
  mode: "FIXED" | "VARIABLE";
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function BaseSalaryRateTable({ rows }: { rows: BaseSalaryRateRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıt yok.</p>;
  }

  const editingRow = rows.find((r) => r.id === editingId);

  return (
    <>
      <ScrollableTable rowCount={rows.length}>
        <TableHeader>
          <TableRow>
            <TableHead>Dönem</TableHead>
            <TableHead>Maaş Türü</TableHead>
            <TableHead>Tutar</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                {formatMonth(row.effectiveFrom)} →{" "}
                {row.effectiveTo ? formatMonth(row.effectiveTo) : "devam ediyor"}
              </TableCell>
              <TableCell>
                {/* Tür satırın kendisinde: karışık geçmişte "bu ay hangi
                    yöntemle hesaplandı" sorusunun cevabı burada. */}
                <span
                  className={cn(
                    "inline-block border px-1.5 py-0.5 text-[11px] font-bold",
                    row.mode === "VARIABLE"
                      ? "border-foreground"
                      : "border-accent-text text-accent-text"
                  )}
                >
                  {row.mode === "VARIABLE" ? "Değişken" : "Sabit"}
                </span>
              </TableCell>
              <TableCell>{formatMoney(row.amount, row.currency)}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingId(row.id)}>
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteBaseSalaryRate(row.id);
                      router.refresh();
                    })
                  }
                >
                  Sil
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </ScrollableTable>

      <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Baz Maaş Dönemini Düzenle</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <BaseSalaryRateForm
              editing={{
                id: editingRow.id,
                amount: Number(editingRow.amount),
                currency: editingRow.currency,
                mode: editingRow.mode,
                effectiveFrom: editingRow.effectiveFrom,
                effectiveTo: editingRow.effectiveTo ?? "",
              }}
              onSuccess={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
