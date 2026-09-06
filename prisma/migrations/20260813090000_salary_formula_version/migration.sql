-- Satırın hangi hesaplama kuralı sürümüyle üretildiğini tutar. Formül
-- değiştiğinde koddaki SALARY_FORMULA_VERSION artırılır; sayfa açılışındaki
-- yeniden hesaplama geride kalan satırları tazeler.
--
-- Varsayılan 0: mevcut bütün satırlar eski sürüm sayılır ve kullanıcı maaş
-- sayfasını bir sonraki açışında yeni kuralla yeniden hesaplanır. Kullanıcının
-- elle girdiği "gerçekleşen ödeme" (actualAmount) yeniden hesaplamada
-- korunuyor, bu yüzden satırları silmeye gerek yok.
ALTER TABLE "MonthlySalaryResult"
  ADD COLUMN "formulaVersion" INTEGER NOT NULL DEFAULT 0;
