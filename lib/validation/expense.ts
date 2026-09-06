import { z } from "zod";

export const expenseCategorySchema = z.object({
  name: z.string().min(1, "Kategori adı gerekli").max(50),
});

export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const expenseEntrySchema = z.object({
  categoryId: z.string().min(1, "Kategori seçin"),
  amount: z.number().positive("Tutar 0'dan büyük olmalı"),
  currency: z.enum(["TRY", "USD"]),
  note: z.string().optional(),
  date: z.string().min(1, "Tarih gerekli"),
  frequency: z.enum(["ONE_TIME", "MONTHLY"]),
  /**
   * Hangi sekmeye ait; belirtilmezse "Genel Giderler". `.default()` yerine
   * `.optional()` kullanılıyor — default, zod'un giriş ve çıkış tiplerini
   * ayırdığı için react-hook-form çözümleyicisiyle uyuşmuyor.
   */
  kind: z.enum(["OTHER", "CREDIT_CARD"]).optional(),
  /** Kredi kartında ekstrenin ödendiği ay (yyyy-MM). */
  paymentMonth: z
    .string()
    .regex(MONTH, "Ödeme ayı yyyy-AA biçiminde olmalı")
    .optional(),
  /** Taksit sayısı; 1 = tek çekim. `amount` her zaman toplam tutardır. */
  installmentCount: z
    .number()
    .int("Taksit sayısı tam sayı olmalı")
    .min(1, "Taksit sayısı en az 1 olmalı")
    .max(36, "Taksit sayısı en fazla 36 olabilir")
    .optional(),
});

export type ExpenseEntryInput = z.infer<typeof expenseEntrySchema>;

export const loanSchema = z.object({
  name: z.string().min(1, "Kredi adı gerekli").max(60),
  currency: z.enum(["TRY", "USD"]),
  startMonth: z.string().regex(MONTH, "Başlangıç ayı gerekli"),
  /** Boş bırakılabilir; o zaman kredi süresiz projekte edilir ve uyarılır. */
  endMonth: z.string().regex(MONTH, "Bitiş ayı yyyy-AA biçiminde olmalı").optional(),
});

export type LoanInput = z.infer<typeof loanSchema>;

export const loanPeriodSchema = z.object({
  loanId: z.string().min(1, "Kredi seçin"),
  amount: z.number().positive("Taksit 0'dan büyük olmalı"),
  effectiveFrom: z.string().regex(MONTH, "Dönem başlangıcı gerekli"),
});

export type LoanPeriodInput = z.infer<typeof loanPeriodSchema>;
