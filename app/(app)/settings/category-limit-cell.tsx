"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { parseDecimalInput } from "@/components/ui/decimal-input";
import { setCategoryBudget } from "@/app/(app)/budgets/actions";

/**
 * Kategori tablosundaki aylık limit hücresi — tıklayınca yerinde
 * düzenleniyor.
 *
 * Bütçeler sayfası aynı değeri kendi düzeninde gösteriyor; burada olması
 * "kategoriyi düzenlerken limitini de görebilmek" için. İki yerde ayrı
 * yazılmış olsalardı biri kaydettiğinde diğeri eskimiş kalırdı; ikisi de
 * aynı sunucu eylemini çağırıyor.
 */
export function CategoryLimitCell({
  categoryId,
  limit,
  currency,
}: {
  categoryId: string;
  /** null = sınır konmamış. */
  limit: string | null;
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(limit ?? "");
  const [isPending, startTransition] = useTransition();

  function save(next: number | null) {
    startTransition(async () => {
      const result = await setCategoryBudget(categoryId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="hover:bg-muted -mx-1 px-1 text-[13px]"
      >
        {limit === null ? (
          <span className="text-muted-foreground underline decoration-dotted underline-offset-4">
            Yok
          </span>
        ) : (
          <span className="font-semibold">{formatMoney(limit, currency)}</span>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save(parseDecimalInput(value));
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-9 w-24"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => save(parseDecimalInput(value))}
      >
        Kaydet
      </Button>
      {limit !== null && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => save(null)}
        >
          Kaldır
        </Button>
      )}
    </div>
  );
}
