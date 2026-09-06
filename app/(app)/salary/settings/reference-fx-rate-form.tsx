"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  referenceFxRateSchema,
  type ReferenceFxRateInput,
} from "@/lib/validation/salary";
import { createReferenceFxRate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export type ReferenceFxRateEditValues = ReferenceFxRateInput & { id: string };

export function ReferenceFxRateForm({
  editing,
  onSuccess,
}: {
  editing?: ReferenceFxRateEditValues;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ReferenceFxRateInput>({
    resolver: zodResolver(referenceFxRateSchema),
    defaultValues: editing ?? { rate: 0, effectiveFrom: "", effectiveTo: "" },
  });

  function onSubmit(values: ReferenceFxRateInput) {
    setServerError(null);
    startTransition(async () => {
      const formData = new FormData();
      if (editing) formData.set("id", editing.id);
      formData.set("rate", String(values.rate));
      formData.set("effectiveFrom", values.effectiveFrom);
      if (values.effectiveTo) formData.set("effectiveTo", values.effectiveTo);

      const result = await createReferenceFxRate({}, formData);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      if (result.warning) {
        toast.warning(`Kaydedildi, ancak: ${result.warning}`);
      }

      if (result.info) {
        toast.info(result.info);
      }

      if (!editing) {
        form.reset({ rate: 0, effectiveFrom: "", effectiveTo: "" });
      }
      router.refresh();
      onSuccess?.();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <FormField
          control={form.control}
          name="rate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Referans Kur (TRY/USD)</FormLabel>
              <FormControl>
                <DecimalInput
                  {...field}
                  onChange={(v) => field.onChange(v ?? 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="effectiveFrom"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dönem Başlangıcı</FormLabel>
              <FormControl>
                <Input type="month" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="effectiveTo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dönem Bitişi (opsiyonel)</FormLabel>
              <FormControl>
                <Input type="month" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor..." : editing ? "Güncelle" : "Ekle"}
        </Button>
        {serverError && (
          <p className="text-destructive text-sm sm:col-span-2 lg:col-span-4">
            {serverError}
          </p>
        )}
      </form>
    </Form>
  );
}
