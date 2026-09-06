"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateBaseCurrency } from "@/app/(app)/settings/actions";

export function BaseCurrencySelect({
  baseCurrency,
}: {
  baseCurrency: "TRY" | "USD";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
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
    <Select
      defaultValue={baseCurrency}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger className="h-8 w-[74px]" aria-label="Baz para birimi">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="TRY">TRY</SelectItem>
        <SelectItem value="USD">USD</SelectItem>
      </SelectContent>
    </Select>
  );
}
