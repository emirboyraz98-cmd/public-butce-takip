"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { setCreditCardMonthlyLimit } from "./actions";

/**
 * Kartın aylık harcama sınırı.
 *
 * Bankanın verdiği kredi limiti değil, kullanıcının kendi koyduğu hedef:
 * "kartla bu ay 40.000'i geçmeyeyim". Kategori sınırlarıyla aynı fikir,
 * kategori kırılımından bağımsız hâli.
 */
export function CreditCardLimitForm({
  limit,
  currency,
}: {
  /** Kayıtlı sınır; null = sınır konmamış. */
  limit: string | null;
  currency: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(
    limit === null ? null : Number(limit)
  );
  const [isPending, startTransition] = useTransition();

  function save(next: number | null) {
    startTransition(async () => {
      const formData = new FormData();
      // Boş dize = sınırı kaldır. 0 gönderilirse sınır 0 olur ki bu geçerli
      // bir hedef; ikisini aynı şeye indirgemek "hiç harcamayacağım"
      // hedefini imkânsız kılardı.
      formData.set("limit", next === null ? "" : String(next));

      const result = await setCreditCardMonthlyLimit({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next === null ? "Aylık sınır kaldırıldı." : "Aylık sınır güncellendi."
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">
        Aylık kart harcama sınırı
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <DecimalInput
          value={value}
          onChange={setValue}
          placeholder={`örn. 40000 ${currency}`}
          className="h-9 w-40"
          aria-label={`Aylık kart harcama sınırı (${currency})`}
        />
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => save(value)}
        >
          Kaydet
        </Button>
        {limit !== null && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setValue(null);
              save(null);
            }}
          >
            Sınırı kaldır
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-[12px] leading-snug">
        Kendi hedefin — bankanın kredi limiti değil. Harcamanın{" "}
        <strong>yapıldığı aya</strong> göre sayılır, ekstrenin ödendiği aya
        göre değil.
      </p>
    </div>
  );
}
