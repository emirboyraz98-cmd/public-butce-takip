-- Kredi kartı harcamalarında taksit desteği. Mevcut kayıtlar tek çekimdir,
-- varsayılan 1 olduğu için veri taşınmasına gerek yok.
ALTER TABLE "Expense"
  ADD COLUMN "installmentCount" INTEGER NOT NULL DEFAULT 1;

-- Kredi taksitlerinin elle "ödendi" işaretlenmesi. Opsiyoneldir; kalan borç
-- hesabı yine takvime göre yapılır.
ALTER TABLE "Loan"
  ADD COLUMN "paidMonths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
