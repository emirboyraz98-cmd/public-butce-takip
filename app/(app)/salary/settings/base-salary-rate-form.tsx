"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  baseSalaryRateSchema,
  type BaseSalaryRateInput,
} from "@/lib/validation/salary";
import { createBaseSalaryRate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export type BaseSalaryRateEditValues = BaseSalaryRateInput & { id: string };

export function BaseSalaryRateForm({
  editing,
  onSuccess,
}: {
  editing?: BaseSalaryRateEditValues;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<BaseSalaryRateInput>({
    resolver: zodResolver(baseSalaryRateSchema),
    defaultValues: editing ?? {
      amount: 0,
      currency: "USD",
      mode: "VARIABLE",
      effectiveFrom: "",
      effectiveTo: "",
    },
  });

  /*
   * Para birimi kilidi artık kullanıcının genel türünden değil, BU FORMDA
   * seçili türden geliyor: değişken formül saatlik ücreti baz maaş / 225
   * ile bulup gün tutarlarını USD üretiyor, TL bir baz maaş oraya girerse
   * sayı sessizce dolar sanılırdı. Sabit dönemde ise tutar olduğu gibi
   * kullanıldığı için para birimi serbest.
   */
  const mode = useWatch({ control: form.control, name: "mode" });
  const lockCurrencyToUsd = mode === "VARIABLE";

  function onSubmit(values: BaseSalaryRateInput) {
    setServerError(null);
    startTransition(async () => {
      const formData = new FormData();
      if (editing) formData.set("id", editing.id);
      formData.set("amount", String(values.amount));
      formData.set("currency", values.currency);
      formData.set("mode", values.mode);
      formData.set("effectiveFrom", values.effectiveFrom);
      if (values.effectiveTo) formData.set("effectiveTo", values.effectiveTo);

      const result = await createBaseSalaryRate({}, formData);

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
        form.reset({
          amount: 0,
          currency: values.currency,
          mode: values.mode,
          effectiveFrom: "",
          effectiveTo: "",
        });
      }
      router.refresh();
      onSuccess?.();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
      >
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maaş Türü</FormLabel>
              <Select
                onValueChange={(v) => {
                  field.onChange(v);
                  // Değişkene geçerken TL bir tutar formda asılı kalmasın:
                  // kilitli alan gönderilmeye devam eder ve kayıt anında
                  // "USD olmalı" hatasıyla reddedilirdi.
                  if (v === "VARIABLE") form.setValue("currency", "USD");
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="VARIABLE">Değişken</SelectItem>
                  <SelectItem value="FIXED">Sabit</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tutar</FormLabel>
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
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Para Birimi</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={lockCurrencyToUsd}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="TRY">TRY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
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
          <p className="text-destructive text-sm sm:col-span-2 lg:col-span-6">
            {serverError}
          </p>
        )}
      </form>
    </Form>
  );
}
