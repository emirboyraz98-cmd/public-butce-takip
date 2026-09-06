"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setCreditCardOffset, setCreditCardStatementDay } from "./actions";

const OPTIONS = [
  { value: 0, label: "Aynı ay içinde" },
  { value: 1, label: "1 ay sonra" },
  { value: 2, label: "2 ay sonra" },
];

/**
 * Ekstre gecikmesi yalnızca YENİ kayıtlara öneri üretir; kaydedilmiş
 * harcamaların ödeme ayı kendi satırında saklandığı için bu ayarı sonradan
 * değiştirmek geçmişi yerinden oynatmaz.
 */
export function CreditCardOffsetForm({ offset }: { offset: number }) {
  const router = useRouter();
  const [value, setValue] = useState(offset);
  const [isPending, startTransition] = useTransition();

  function save(next: number) {
    setValue(next);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("offset", String(next));
      const result = await setCreditCardOffset({}, formData);
      if (result.error) {
        toast.error(result.error);
        setValue(offset);
        return;
      }
      toast.success("Ekstre gecikmesi güncellendi.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Ekstre ödemesi:</span>
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          disabled={isPending}
          onClick={() => save(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Ekstrenin kesildiği gün.
 *
 * Sabit ay gecikmesinin tek başına yetmediği yer: kesim ayın ortasında
 * olduğu için AYNI ayın başındaki ve sonundaki harcama farklı ekstrelere
 * düşer. Bu ayar yalnızca mailden gelen kayıtların ödeme ayını önerirken
 * kullanılıyor; elle girilen harcamalar yukarıdaki gecikmeyi kullanmaya
 * devam ediyor.
 */
export function CreditCardStatementDayForm({ day }: { day: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(day));
  const [isPending, startTransition] = useTransition();

  function save() {
    if (value === String(day)) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("day", value);
      const result = await setCreditCardStatementDay({}, formData);
      if (result.error) {
        toast.error(result.error);
        setValue(String(day));
        return;
      }
      toast.success("Kesim günü güncellendi.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Hesap kesim günü:</span>
      <Input
        type="number"
        min={1}
        max={28}
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        className="h-8 w-20"
      />
      <span className="text-muted-foreground text-xs">
        Mailden gelen harcamaların ekstre ayı buna göre belirlenir.
      </span>
    </div>
  );
}
