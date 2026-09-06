"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resetTours } from "../tour-actions";

export function ReplayTourButton() {
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
          const result = await resetTours();
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Tanıtım sıfırlandı. Sekmelere girdikçe tekrar çıkacak.");
          router.refresh();
        })
      }
    >
      {isPending ? "Sıfırlanıyor..." : "Tanıtımı tekrar göster"}
    </Button>
  );
}
