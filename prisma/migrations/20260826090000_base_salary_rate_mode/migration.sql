-- Maaş türü artık kullanıcının tamamına değil, baz maaş DÖNEMİNE ait.
-- Değişkenden sabite (ya da tersine) geçen biri, geçmiş aylarını eski
-- yöntemiyle hesaplanmış hâlde tutup yeni aylarını yeni yöntemle görebilsin.
ALTER TABLE "BaseSalaryRate"
  ADD COLUMN "mode" "SalaryMode" NOT NULL DEFAULT 'VARIABLE';

-- Mevcut dönemler kullanıcının o ana kadarki türünü devralır: göç öncesi ve
-- sonrası aynı sonucu vermesi için tek doğru başlangıç değeri bu.
UPDATE "BaseSalaryRate" r
   SET "mode" = u."salaryMode"
  FROM "User" u
 WHERE u."id" = r."userId";
