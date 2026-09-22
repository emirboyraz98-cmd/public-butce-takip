"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { reconcileFreeCash } from "./actions";

export type LedgerRow = {
  /** Gün/ay/yıl olarak yazılmış tarih. */
  dateLabel: string;
  /** "Satış (THYAO)" gibi, okunmaya hazır açıklama. */
  label: string;
  /** İşaretli, yazılmış değişim. Boşsa bakiye oynamamıştır. */
  deltaLabel: string;
  /** Değişimin yönü — renk için. */
  tone: "up" | "down" | "flat";
  /** O andaki bakiye, yazılmış hâli. */
  balanceLabel: string;
  isCorrection: boolean;
};

/**
 * Serbest nakdin bugünkü rakamına nasıl geldiğinin dökümü, altında da
 * mutabakat kutusu.
 *
 * Serbest nakit tek bir sayı olarak duruyordu; brokerdeki gerçekle
 * tutmadığında kullanıcının nerede saptığını bulmasının yolu yoktu.
 * Bakiye sütunu satır satır yazılınca sapmanın başladığı yer gözle
 * görülüyor; tutturamadığı durumda da eksik kayıtları tek tek avlamak
 * yerine gerçek tutarı girip tek satırlık bir düzeltme yazabiliyor.
 */
export function FreeCashLedger({
  rows,
  today,
  baseCurrency,
  currentLabel,
}: {
  rows: LedgerRow[];
  /** yyyy-MM-dd. Sunucudan geliyor: istemcide üretmek hidrasyonu bozar. */
  today: string;
  baseCurrency: string;
  currentLabel: string;
}) {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [occurredAt, setOccurredAt] = useState(today);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<
    { tone: "error" | "info"; text: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setMessage(null);
      const parsed = parseDecimalInput(actual);
      if (parsed === null || parsed < 0) {
        setMessage({ tone: "error", text: "Geçerli bir tutar gir." });
        return;
      }

      const formData = new FormData();
      formData.set("actualAmount", String(parsed));
      formData.set("currency", currency);
      formData.set("occurredAt", occurredAt);
      formData.set("note", note);

      const result = await reconcileFreeCash({}, formData);
      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      if (result.info) setMessage({ tone: "info", text: result.info });
      setActual("");
      setNote("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <EmptyState
          title="Serbest nakdi oynatan bir kayıt yok"
          description="Bir satışı “parayı hesabıma çektim” demeden girdiğinde ya da hesaba para yatırdığında burada satır satır görünür."
        />
      ) : (
        <>
          {/*
            Telefonda tablo, dört sütunu 390px'e sığdırmaya çalışıp sarıyor;
            asgari genişlik verilince de asıl iki sütun (Değişim, Bakiye)
            ekran dışına kaçıyordu — oysa dökümün bütün amacı bakiyeyi
            görmek. Küçük ekranda satırlar yığılıyor, sayılar altta yan yana.
          */}
          <ul className="divide-hairline border-border border sm:hidden">
            {rows.map((r, i) => (
              <li key={i} className="px-3 py-2.5">
                <p className="text-muted-foreground text-[12px]">
                  {r.dateLabel}
                </p>
                <p className="mt-0.5 text-[13px]">
                  {r.label}
                  {r.isCorrection && (
                    <span className="text-muted-foreground ml-1.5 text-[11px]">
                      (nakit akışına girmez)
                    </span>
                  )}
                </p>
                <p className="mt-1 flex items-baseline justify-between gap-3 tabular-nums">
                  <span
                    className={cn(
                      "text-[13px]",
                      r.tone === "down" && "text-destructive",
                      r.tone === "flat" && "text-muted-foreground"
                    )}
                  >
                    {r.deltaLabel}
                  </span>
                  <span className="text-[14px] font-semibold">
                    {r.balanceLabel}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <div className="border-border hidden overflow-x-auto border sm:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-border text-muted-foreground border-b-2 text-left">
                  <th className="px-3 py-2 font-semibold">Tarih</th>
                  <th className="px-3 py-2 font-semibold">Olay</th>
                  <th className="px-3 py-2 text-right font-semibold">Değişim</th>
                  <th className="px-3 py-2 text-right font-semibold">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-hairline">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {r.dateLabel}
                    </td>
                    <td className="px-3 py-2">
                      {r.label}
                      {r.isCorrection && (
                        <span className="text-muted-foreground ml-1.5 text-[11px]">
                          (nakit akışına girmez)
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums whitespace-nowrap",
                        r.tone === "down" && "text-destructive",
                        r.tone === "flat" && "text-muted-foreground"
                      )}
                    >
                      {r.deltaLabel}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                      {r.balanceLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="bg-sunken border-hairline space-y-3 border p-3">
        <div>
          <p className="text-[13px] font-bold">Brokerdeki tutarla eşitle</p>
          <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
            Uygulamaya göre şu an <strong>{currentLabel}</strong>. Brokerde
            gerçekte duran tutarı yaz; aradaki farkı tek satırlık bir
            düzeltme olarak kaydedeyim. Eksik girdiğin alım satımları tek tek
            bulman gerekmez.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="reconcile-amount">
              Gerçek tutar
            </label>
            <Input
              id="reconcile-amount"
              type="text"
              inputMode="decimal"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="w-32"
            />
          </div>

          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-24" aria-label="Para birimi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TRY">TRY</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="reconcile-date">
              Tarih
            </label>
            <Input
              id="reconcile-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="grid min-w-[10rem] flex-1 gap-1.5">
            <label className="text-sm font-medium" htmlFor="reconcile-note">
              Not <span className="text-muted-foreground">(isteğe bağlı)</span>
            </label>
            <Input
              id="reconcile-note"
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={isPending || !actual}
            onClick={submit}
          >
            {isPending ? "Hesaplanıyor…" : "Eşitle"}
          </Button>
        </div>

        {message && (
          <p
            role="alert"
            className={cn(
              "border px-2.5 py-2 text-xs leading-snug",
              message.tone === "error"
                ? "border-destructive text-foreground"
                : "border-border text-muted-foreground"
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
