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
import { createCashMovement, deleteCashMovement } from "./actions";

export type CashMovementRow = {
  id: string;
  direction: "DEPOSIT" | "WITHDRAWAL";
  /**
   * Gerçek transfer mi, mutabakat düzeltmesi mi. Düzeltmeler de bu listede
   * duruyor — yanlış girilen bir düzeltme buradan silinebilmeli — ama
   * "Hesaba yatırdım" diye yazılamazlar: öyle bir para hareketi olmadı.
   */
  kind: "TRANSFER" | "CORRECTION";
  /** Kendi para birimiyle birlikte yazılmış tutar. */
  amountLabel: string;
  /** yyyy-MM-dd */
  occurredAt: string;
  /** Gün/ay/yıl olarak yazılmış hâli. */
  occurredAtLabel: string;
  note: string | null;
};

/**
 * Yatırım hesabı ile cep arasındaki transferler.
 *
 * Serbest nakdi doğrudan düzenlenebilir yapmak yerine OLAYI kaydediyoruz.
 * Türetilmiş sayının üzerine elle yazmak iki şeyi bozardı: para nereye
 * gittiğini kaybederdi (çekilen tutar Genel Bakış'ta hiç görünmezdi) ve
 * elle girilen değer, sonraki her satıştan sonra yeniden düzeltilmek
 * zorunda kalırdı.
 */
export function CashMovementPanel({
  movements,
  today,
  freeCashLabel,
}: {
  movements: CashMovementRow[];
  /** yyyy-MM-dd. Sunucudan geliyor: istemcide üretmek hidrasyonu bozar. */
  today: string;
  /** Çekilebilecek tutar, baz para biriminde yazılmış hâli. */
  freeCashLabel: string;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"DEPOSIT" | "WITHDRAWAL">(
    "WITHDRAWAL"
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"TRY" | "USD">("TRY");
  const [occurredAt, setOccurredAt] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const parsed = parseDecimalInput(amount);
      if (parsed === null || parsed <= 0) {
        setError("Geçerli bir tutar gir.");
        return;
      }

      const formData = new FormData();
      formData.set("direction", direction);
      formData.set("amount", String(parsed));
      formData.set("currency", currency);
      formData.set("occurredAt", occurredAt);
      formData.set("note", note);

      const result = await createCashMovement({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      setAmount("");
      setNote("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/*
          Yön en başta ve iki düğme hâlinde: açılır listede "DEPOSIT /
          WITHDRAWAL" seçmek, paranın hangi tarafa gittiğini okumadan
          anlaşılmaz kılıyordu.
        */}
        <div
          role="radiogroup"
          aria-label="Para yönü"
          className="border-border grid grid-cols-2 border"
        >
          {(
            [
              ["WITHDRAWAL", "Hesabıma çektim", "yatırımdan cebe"],
              ["DEPOSIT", "Hesaba para yatırdım", "cepten yatırıma"],
            ] as const
          ).map(([value, label, hint], i) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              onClick={() => setDirection(value)}
              className={cn(
                // Segment deseni uygulamanın başka yerlerinde de var (baz
                // para birimi seçimi); seçili taraf dolu, diğeri boş.
                "min-h-11 px-3 py-2 text-left transition-colors sm:min-h-8",
                i > 0 && "border-border border-l",
                direction === value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-foreground/7"
              )}
            >
              <span className="block text-[13px] font-semibold">{label}</span>
              <span
                className={cn(
                  "block text-[11px]",
                  direction === value ? "opacity-80" : "text-muted-foreground"
                )}
              >
                {hint}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="cash-amount">
              Tutar
            </label>
            <Input
              id="cash-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32"
            />
          </div>

          <Select
            value={currency}
            onValueChange={(v) => setCurrency(v as "TRY" | "USD")}
          >
            <SelectTrigger className="w-24" aria-label="Para birimi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TRY">TRY</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="cash-date">
              Tarih
            </label>
            <Input
              id="cash-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="grid min-w-[10rem] flex-1 gap-1.5">
            <label className="text-sm font-medium" htmlFor="cash-note">
              Not <span className="text-muted-foreground">(isteğe bağlı)</span>
            </label>
            <Input
              id="cash-note"
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button size="sm" disabled={isPending || !amount} onClick={submit}>
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>

        <p className="text-muted-foreground text-[12px] leading-snug">
          Şu an çekilebilecek serbest nakit: <strong>{freeCashLabel}</strong>.
          Tarihi geçmişe alabilirsin; para o ayın nakit akışına yazılır.
        </p>

        {error && (
          <p
            role="alert"
            className="border-destructive text-foreground border px-2.5 py-2 text-xs leading-snug"
          >
            {error}
          </p>
        )}
      </div>

      {movements.length === 0 ? (
        <EmptyState
          title="Henüz transfer kaydı yok"
          description="Sattığın bir hisseden gelen parayı sonradan hesabına çektiysen buraya yaz; serbest nakit düşer ve para çektiğin ayda Genel Bakış'ta görünür."
        />
      ) : (
        <ul className="divide-hairline border-border border">
          {movements.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {m.kind === "CORRECTION"
                    ? m.direction === "WITHDRAWAL"
                      ? "Düzeltme (azaltıldı)"
                      : "Düzeltme (artırıldı)"
                    : m.direction === "WITHDRAWAL"
                      ? "Hesabımdan çektim"
                      : "Hesaba yatırdım"}{" "}
                  <span className="tabular-nums">{m.amountLabel}</span>
                  {m.kind === "CORRECTION" && (
                    <span className="text-muted-foreground ml-1.5 font-normal text-[11px]">
                      nakit akışına girmez
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-[12px]">
                  {m.occurredAtLabel}
                  {m.note && ` · ${m.note}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteCashMovement(m.id);
                    router.refresh();
                  })
                }
              >
                Sil
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
