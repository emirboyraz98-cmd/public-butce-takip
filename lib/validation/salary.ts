import { z } from "zod";

/**
 * Takvimde sürükleyerek seçilen aralık. Üst sınır bir aylık seçimin biraz
 * üstünde: takvim tek ay gösteriyor, daha uzun bir liste ancak istemcinin
 * gönderdiği veri bozulmuşsa gelebilir.
 *
 * `WORKED` bir gün tipi değil, "işbaşındaydım" işareti: sunucu her günün
 * tipini ayrı belirler (bkz. dayTypeForMark).
 */
export const markDaysSchema = z.object({
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-AA-GG olmalı"))
    .min(1, "En az bir gün seç")
    .max(40, "Tek seferde en fazla 40 gün"),
  mark: z.enum(["WORKED", "NORMAL", "SUNDAY", "PUBLIC_HOLIDAY", "LEAVE"]),
});

export type MarkDaysInput = z.infer<typeof markDaysSchema>;

const periodSchema = z.object({
  effectiveFrom: z.string().min(1, "Dönem başlangıcı gerekli"),
  effectiveTo: z.string().optional(),
});

export const baseSalaryRateSchema = z
  .object({
    amount: z.number().positive("Baz maaş 0'dan büyük olmalı"),
    currency: z.enum(["TRY", "USD"]),
    /**
     * Bu dönemde maaşın nasıl hesaplandığı. Kullanıcının tamamına değil
     * döneme ait: işten işe geçen biri geçmiş aylarını eski yöntemiyle
     * hesaplanmış hâlde tutabilsin.
     */
    mode: z.enum(["FIXED", "VARIABLE"]),
  })
  .merge(periodSchema)
  .refine(
    (data) =>
      !data.effectiveTo || new Date(data.effectiveTo) >= new Date(data.effectiveFrom),
    { message: "Dönem bitişi başlangıçtan önce olamaz", path: ["effectiveTo"] }
  )
  .refine((data) => data.mode !== "VARIABLE" || data.currency === "USD", {
    // Değişken formül saatlik ücreti baz maaş / 225 ile buluyor ve gün
    // tutarlarını USD üretiyor; TL bir baz maaş buraya girerse sayı sessizce
    // dolar sanılıp TCMB düzeltmesinden geçer.
    message: "Değişken maaşta baz maaş USD cinsinden girilir",
    path: ["currency"],
  });

export type BaseSalaryRateInput = z.infer<typeof baseSalaryRateSchema>;

export const referenceFxRateSchema = z
  .object({
    rate: z.number().positive("Referans kur 0'dan büyük olmalı"),
  })
  .merge(periodSchema)
  .refine(
    (data) =>
      !data.effectiveTo || new Date(data.effectiveTo) >= new Date(data.effectiveFrom),
    { message: "Dönem bitişi başlangıçtan önce olamaz", path: ["effectiveTo"] }
  );

export type ReferenceFxRateInput = z.infer<typeof referenceFxRateSchema>;

export const actualPaymentSchema = z.object({
  month: z.string().min(1),
  actualAmount: z.number().positive("Tutar 0'dan büyük olmalı").nullable(),
});

export type ActualPaymentInput = z.infer<typeof actualPaymentSchema>;
