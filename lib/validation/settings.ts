import { z } from "zod";

export const baseCurrencySchema = z.object({
  baseCurrency: z.enum(["TRY", "USD"]),
});

export type BaseCurrencyInput = z.infer<typeof baseCurrencySchema>;
