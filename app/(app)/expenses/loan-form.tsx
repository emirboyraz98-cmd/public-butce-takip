"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createLoan } from "./loan-actions";

/**
 * Yeni kredi açma formu — pencerede.
 *
 * Önce listenin üstünde açık duruyordu ve beş alanlık bir form, kaç kredisi
 * olduğuna bakmak isteyen herkese her seferinde yer kaplıyordu. Kredi
 * eklemek nadir bir işlem; listeye bakmak sık. Gider eklemedeki gibi
 * düğmeye taşındı.
 *
 * Kredi ile ilk taksit dönemi birlikte oluşturulur; taksiti olmayan kredi
 * hiçbir aya gider yazmazdı. Bitiş ayı isteğe bağlı ama boş bırakılırsa
 * kredi projeksiyonda sonsuza kadar sürer — form bunu açıkça uyarır.
 */
export function LoanForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [amount, setAmount] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseDecimalInput(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      setError("Taksit tutarı 0'dan büyük geçerli bir sayı olmalı.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("currency", currency);
      formData.set("startMonth", startMonth);
      if (endMonth) formData.set("endMonth", endMonth);
      formData.set("amount", String(parsedAmount));

      const result = await createLoan({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      setName("");
      setStartMonth("");
      setEndMonth("");
      setAmount("");
      onOpenChange(false);
      router.refresh();
    });
  }

  const selectClass =
    "border-input bg-muted h-9 w-full border px-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kredi ekle</DialogTitle>
          <DialogDescription className="sr-only">
            Kredi adı, para birimi, taksit ayları ve aylık taksit tutarı.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="loan-name">
            Kredi Adı
          </label>
          <Input
            id="loan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Konut Kredisi"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="loan-currency">
            Para Birimi
          </label>
          <select
            id="loan-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={selectClass}
          >
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="loan-start">
            İlk Taksit Ayı
          </label>
          <Input
            id="loan-start"
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="loan-end">
            Son Taksit Ayı
          </label>
          <Input
            id="loan-end"
            type="month"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            min={startMonth || undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="loan-amount">
            Aylık Taksit
          </label>
          <Input
            id="loan-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="15000"
            required
          />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Son taksit ayını boş bırakırsan kredi <strong>süresiz</strong> kabul
        edilir ve Genel Bakış&apos;taki projeksiyonda sonsuza kadar gider
        yazar. Taksit tutarın ileride değişecekse krediyi kaydettikten sonra
        &quot;Ödeme dönemi ekle&quot; ile yeni dönem açabilirsin.
      </p>

      {error && <p className="text-destructive text-sm font-semibold">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Vazgeç
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ekleniyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
