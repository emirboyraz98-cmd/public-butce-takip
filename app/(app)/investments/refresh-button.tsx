"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { refreshAllPrices } from "./actions";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshAllPrices();
          if (result.failed && result.failed.length > 0) {
            toast.error(`Fiyatı çekilemedi: ${result.failed.join(", ")}`);
          } else {
            toast.success(`${result.refreshed ?? 0} fiyat güncellendi`);
          }
          router.refresh();
        })
      }
    >
      {isPending ? "Yenileniyor..." : "Şimdi Yenile"}
    </Button>
  );
}
