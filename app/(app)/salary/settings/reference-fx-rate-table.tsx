"use client";

import { useState, useTransition } from "react";
import { formatMonth } from "@/lib/format";
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
import { deleteReferenceFxRate } from "./actions";
import { ReferenceFxRateForm } from "./reference-fx-rate-form";

export type ReferenceFxRateRow = {
  id: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function ReferenceFxRateTable({ rows }: { rows: ReferenceFxRateRow[] }) {
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
            <TableHead>Referans Kur</TableHead>
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
              <TableCell>{row.rate}</TableCell>
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
                      await deleteReferenceFxRate(row.id);
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
            <DialogTitle>Referans Kur Dönemini Düzenle</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <ReferenceFxRateForm
              editing={{
                id: editingRow.id,
                rate: Number(editingRow.rate),
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
