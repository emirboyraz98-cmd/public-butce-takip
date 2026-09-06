-- Önceki migration "usdNominalTotal" -> "nominalTotal" olarak yeniden adlandırırken
-- NOT NULL kısıtını kaldırmayı unutmuştu (avgUsdTryRate/referenceRate için yapılmıştı).
-- Sabit maaş ayları nominalTotal'ı null bırakır, bu yüzden kısıt kaldırılmalı.
ALTER TABLE "MonthlySalaryResult" ALTER COLUMN "nominalTotal" DROP NOT NULL;
