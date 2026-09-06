import { z } from "zod";

export const assetTypeSchema = z.enum([
  "CRYPTO",
  "STOCK",
  "ETF",
  "FOREX",
  "COMMODITY",
  "MANUAL",
]);

export const tradeSideSchema = z.enum(["BUY", "SELL"]);

export const transactionSchema = z.object({
  symbol: z
    .string()
    .min(1, "Sembol gerekli")
    .max(20)
    .transform((s) => s.trim().toUpperCase()),
  assetType: assetTypeSchema,
  side: tradeSideSchema,
  // Kesirli adetler desteklenir (örn. 0.3 ons altın).
  quantity: z.number().positive("Adet 0'dan büyük olmalı"),
  pricePerUnit: z.number().nonnegative("Birim fiyat negatif olamaz"),
  currency: z.enum(["TRY", "USD"]),
  tradedAt: z.string().min(1, "Tarih gerekli"),
  note: z.string().max(200).optional().nullable(),
  /**
   * Uygulamaya başlamadan önce sahip olunan pozisyon. Maliyet hesabına
   * girer, nakit akışına girmez. Varsayılan kapalı: açık gelseydi gerçek
   * bir alım yapan kişi kapatmayı unutur, alım nakit akışında görünmezdi.
   */
  isOpening: z.boolean().optional(),
  /**
   * Satışta: hasılat cebe çekildi mi. Belirtilmezse `true` — eski
   * davranış. `false` ise para yatırım hesabında serbest nakit kalır.
   */
  proceedsWithdrawn: z.boolean().optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

/** Var olan bir işlemi düzenlerken kimliği de gerekir. */
export const transactionUpdateSchema = transactionSchema.extend({
  id: z.string().min(1),
});

export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;

export const manualPriceSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().positive("Fiyat 0'dan büyük olmalı"),
  currency: z.enum(["TRY", "USD"]),
});

export type ManualPriceInput = z.infer<typeof manualPriceSchema>;
