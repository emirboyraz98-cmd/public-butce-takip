"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { updateBaseCurrency } from "@/app/(app)/settings/actions";

const OPTIONS = ["TRY", "USD"] as const;

/**
 * Baz para birimi — kenar çubuğunun dibinde iki düğmelik segment.
 *
 * Önce açılır listeydi ve üst çubukta duruyordu. Teslimat bunu kenar
 * çubuğunun altına, seçili olanı doğrudan gösteren bir segmente çeviriyor:
 * seçenek iki tane olduğu için listeyi açmak fazladan bir adımdı ve hangi
 * para biriminde çalışıldığı ancak listeyi açınca görülüyordu.
 *
 * EUR bilerek yok. Teslimat EUR'yu her baz para birimi seçicisinden
 * kaldırdı; EUR yalnızca TEK BİR HARCAMANIN para birimi olarak kalıyor
 * (o ayın ortalama kuruyla raporlamaya çevrilir).
 */
export function BaseCurrencySegment({
  baseCurrency,
  className,
}: {
  baseCurrency: "TRY" | "USD";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(value: string) {
    if (value === baseCurrency) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("baseCurrency", value);
      const result = await updateBaseCurrency({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Baz para birimi güncellendi");
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Baz para birimi"
      className={cn("border-border flex border", className)}
    >
      {OPTIONS.map((option, i) => (
        <button
          key={option}
          type="button"
          disabled={isPending}
          aria-pressed={option === baseCurrency}
          onClick={() => select(option)}
          className={cn(
            // 44px dokunma hedefi telefonda zorunlu; masaüstünde 32px'e iner.
            "min-h-11 flex-1 px-3 text-[13px] font-semibold transition-colors sm:min-h-8",
            i > 0 && "border-border border-l",
            option === baseCurrency
              ? "bg-primary text-primary-foreground"
              : "hover:bg-foreground/7"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
