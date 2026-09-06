"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { deleteTransaction, updateTransaction } from "./actions";

export type TransactionRow = {
  id: string;
  symbol: string;
  assetType: string;
  side: "BUY" | "SELL";
  quantity: string;
  pricePerUnit: string;
  currency: string;
  tradedAt: string;
  note: string | null;
  /** Uygulamaya başlamadan önce sahip olunan pozisyon. */
  isOpening: boolean;
};

/**
 * Yanlış girilen bir işlemi yerinde düzeltebilmek için satır bazlı düzenleme.
 * Kaydedince pozisyonlar (ağırlıklı ortalama maliyet, elde tutulan değer)
 * işlem defterinden yeniden türetildiği için üstteki özet de güncellenir.
 */
function EditableRow({
  row,
  onDone,
}: {
  row: TransactionRow;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(row);
  const [isPending, startTransition] = useTransition();

  function save() {
    const quantity = parseDecimalInput(draft.quantity);
    const pricePerUnit = parseDecimalInput(draft.pricePerUnit);

    if (quantity === null || pricePerUnit === null) {
      toast.error("Adet ve birim fiyat geçerli birer sayı olmalı.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", draft.id);
      formData.set("symbol", draft.symbol);
      formData.set("assetType", draft.assetType);
      formData.set("side", draft.side);
      // Virgüllü giriş sunucuda Number() ile NaN olurdu; normalize edilmiş
      // sayıyı gönderiyoruz.
      formData.set("quantity", String(quantity));
      formData.set("pricePerUnit", String(pricePerUnit));
      formData.set("currency", draft.currency);
      formData.set("tradedAt", draft.tradedAt);
      if (draft.note) formData.set("note", draft.note);
      if (draft.isOpening) formData.set("isOpening", "true");

      const result = await updateTransaction({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("İşlem güncellendi.");
      onDone();
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          type="date"
          value={draft.tradedAt}
          onChange={(e) => setDraft({ ...draft, tradedAt: e.target.value })}
          className="h-8 w-36"
        />
      </TableCell>
      <TableCell>
        <select
          value={draft.side}
          onChange={(e) =>
            setDraft({ ...draft, side: e.target.value as "BUY" | "SELL" })
          }
          className="border-input bg-muted h-8 border px-2 text-sm"
        >
          <option value="BUY">Alış</option>
          <option value="SELL">Satış</option>
        </select>
      </TableCell>
      <TableCell>
        <Input
          value={draft.symbol}
          onChange={(e) =>
            setDraft({ ...draft, symbol: e.target.value.toUpperCase() })
          }
          className="h-8 w-28"
        />
        {/* Var olan kayıtlar da sonradan açılış işaretlenebilsin: uygulamayı
            kullanmaya başlarken mevcut portföyünü normal alış olarak girmiş
            olabilir. Satışta anlamsız olduğu için yalnızca alışta çıkar. */}
        {draft.side === "BUY" && (
          <label className="text-muted-foreground mt-1 flex cursor-pointer items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={draft.isOpening}
              onChange={(e) =>
                setDraft({ ...draft, isOpening: e.target.checked })
              }
              className="size-3.5"
            />
            açılış
          </label>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">{draft.assetType}</TableCell>
      <TableCell>
        {/* type="number" burada kullanılamaz: tarayıcı "17," gibi ara
            durumları geçersiz sayıp değeri boşaltıyor, ondalık girilemiyor. */}
        <Input
          type="text"
          inputMode="decimal"
          value={draft.quantity}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          className="h-8 w-28"
        />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Input
          type="text"
          inputMode="decimal"
          value={draft.pricePerUnit}
          onChange={(e) => setDraft({ ...draft, pricePerUnit: e.target.value })}
          className="h-8 w-28"
        />
      </TableCell>
      <TableCell className="hidden sm:table-cell">{draft.currency}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <Input
          value={draft.note ?? ""}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          className="h-8 w-32"
        />
      </TableCell>
      <TableCell className="space-x-1 text-right">
        <Button size="sm" className="h-8" disabled={isPending} onClick={save}>
          Kaydet
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onDone}>
          Vazgeç
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function TransactionLog({ transactions }: { transactions: TransactionRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Henüz işlem kaydı yok. Yukarıdan bir alış ekleyerek başla.
      </p>
    );
  }

  return (
    <ScrollableTable rowCount={transactions.length}>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>İşlem</TableHead>
            <TableHead>Sembol</TableHead>
            <TableHead className="hidden sm:table-cell">Tür</TableHead>
            <TableHead>Adet</TableHead>
            <TableHead className="hidden sm:table-cell">Birim Fiyat</TableHead>
            <TableHead className="hidden sm:table-cell">Para Birimi</TableHead>
            <TableHead className="hidden sm:table-cell">Not</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) =>
            editingId === t.id ? (
              <EditableRow
                key={t.id}
                row={t}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
              />
            ) : (
              <TableRow key={t.id}>
                <TableCell>{formatDate(t.tradedAt)}</TableCell>
                <TableCell>
                  <span
                    className={
                      t.side === "BUY"
                        ? "text-foreground"
                        : "text-destructive"
                    }
                  >
                    {t.side === "BUY" ? "Alış" : "Satış"}
                  </span>
                </TableCell>
                <TableCell className="font-medium">
                  {t.symbol}
                  {t.isOpening && (
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      (açılış)
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{t.assetType}</TableCell>
                <TableCell>{formatQuantity(t.quantity)}</TableCell>
                <TableCell className="hidden sm:table-cell">{formatPrice(t.pricePerUnit, t.currency)}</TableCell>
                <TableCell className="hidden sm:table-cell">{t.currency}</TableCell>
                <TableCell className="text-muted-foreground hidden max-w-40 truncate text-xs sm:table-cell">
                  {t.note ?? ""}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-2 sm:h-8 sm:px-3"
                    aria-label="Düzenle"
                    onClick={() => setEditingId(t.id)}
                  >
                    <PencilIcon className="size-3.5 sm:hidden" aria-hidden />
                    <span className="hidden sm:inline">Düzenle</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2 sm:h-8 sm:px-3"
                    disabled={isPending}
                    aria-label="Sil"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteTransaction(t.id);
                        router.refresh();
                      })
                    }
                  >
                    <Trash2Icon className="size-3.5 sm:hidden" aria-hidden />
                    <span className="hidden sm:inline">Sil</span>
                  </Button>
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
    </ScrollableTable>
  );
}
