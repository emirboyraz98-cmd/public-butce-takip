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
import { setManualPrice } from "./actions";

export function ManualPriceForm({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"TRY" | "USD">("TRY");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{symbol} Fiyatı</label>
        <Input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-32"
        />
      </div>
      <Select value={currency} onValueChange={(v) => setCurrency(v as "TRY" | "USD")}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TRY">TRY</SelectItem>
          <SelectItem value="USD">USD</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={isPending || !price}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const formData = new FormData();
            formData.set("symbol", symbol);
            const parsed = parseDecimalInput(price);
            if (parsed === null) {
              setError("Geçerli bir fiyat gir.");
              return;
            }
            formData.set("price", String(parsed));
            formData.set("currency", currency);
            const result = await setManualPrice({}, formData);
            if (result.error) {
              setError(result.error);
              return;
            }
            setPrice("");
            router.refresh();
          })
        }
      >
        Kaydet
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
