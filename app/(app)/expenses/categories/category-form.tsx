"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  expenseCategorySchema,
  type ExpenseCategoryInput,
} from "@/lib/validation/expense";
import { createExpenseCategory } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function CategoryForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ExpenseCategoryInput>({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: ExpenseCategoryInput) {
    setServerError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", values.name);

      const result = await createExpenseCategory({}, formData);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      form.reset({ name: "" });
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex items-end gap-3"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Yeni Kategori</FormLabel>
              <FormControl>
                <Input placeholder="örn. Eğlence" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Ekleniyor..." : "Ekle"}
        </Button>
      </form>
      {serverError && <p className="text-destructive mt-2 text-sm">{serverError}</p>}
    </Form>
  );
}
