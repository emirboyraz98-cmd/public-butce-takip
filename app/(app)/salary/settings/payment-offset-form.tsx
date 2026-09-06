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
import { setSalaryPaymentOffset } from "./actions";

const OPTIONS = [
  { value: "0", label: "Hak edilen ayın içinde ödeniyor" },
  { value: "1", label: "Ertesi ay ödeniyor" },
  { value: "2", label: "2 ay sonra ödeniyor" },
  { value: "3", label: "3 ay sonra ödeniyor" },
];

export function PaymentOffsetForm({ offset }: { offset: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid max-w-sm gap-1.5">
      <label className="text-sm font-medium" htmlFor="salary-offset">
        Ödeme zamanı
      </label>
      <Select
        value={String(offset)}
        onValueChange={(value) =>
          startTransition(async () => {
            const result = await setSalaryPaymentOffset(Number(value));
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Ödeme zamanı güncellendi.");
            router.refresh();
          })
        }
        disabled={isPending}
      >
        <SelectTrigger id="salary-offset" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
