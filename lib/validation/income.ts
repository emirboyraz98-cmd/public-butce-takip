import { z } from "zod";

export const incomeCategorySchema = z.object({
  name: z.string().min(1, "Kategori adı gerekli").max(50),
});

export type IncomeCategoryInput = z.infer<typeof incomeCategorySchema>;

export const incomeEntrySchema = z.object({
  categoryId: z.string().min(1, "Kategori seçin"),
  amount: z.number().positive("Tutar 0'dan büyük olmalı"),
  currency: z.enum(["TRY", "USD"]),
  note: z.string().optional(),
  date: z.string().min(1, "Tarih gerekli"),
  frequency: z.enum(["ONE_TIME", "MONTHLY"]),
  /**
   * Tekrarlayan kaydın son ayı (yyyy-MM), o ay DAHİL. Boş = hâlâ sürüyor.
   * Tek seferlik kayıtlarda yok sayılır.
   */
  recurrenceEndMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Ay yyyy-AA biçiminde olmalı")
    .optional()
    .nullable(),
});

export type IncomeEntryInput = z.infer<typeof incomeEntrySchema>;
