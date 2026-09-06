"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Result = { error?: string; success?: boolean; added?: number };

/**
 * Varsayılan kategori listesi zamanla genişlediği için, eskiden kayıt olmuş
 * kullanıcıların yeni kategorileri elle eklemesi gerekiyordu. Bu düğme
 * eksikleri tek seferde ekler; mevcut kategorilere dokunmaz.
 */
export function AddDefaultCategories({ action }: { action: () => Promise<Result> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(
            result.added
              ? `${result.added} kategori eklendi.`
              : "Eksik varsayılan kategori yok."
          );
          router.refresh();
        })
      }
    >
      {isPending ? "Ekleniyor..." : "Eksik varsayılanları ekle"}
    </Button>
  );
}
