-- Kayıt düzeltmesi ile gerçek transferi ayırır.
--
-- Eksik girilmiş alım/satımlar yüzünden serbest nakit gerçekte olandan
-- sapabiliyor. Kullanıcı bunu tek bir düzeltme satırıyla oturtabilmeli, ama
-- o satır nakit akışına GİRMEMELİ: para cep ile hesap arasında gerçekten
-- gitmedi, yalnızca kayıt eksikti. Transfer olarak yazılsaydı Genel Bakış'a
-- hiç yaşanmamış bir gelir ya da gider düşerdi.
--
-- Varsayılan TRANSFER: mevcut kayıtların hepsi gerçek para hareketiydi.
CREATE TYPE "CashMovementKind" AS ENUM ('TRANSFER', 'CORRECTION');

ALTER TABLE "InvestmentCashMovement"
  ADD COLUMN "kind" "CashMovementKind" NOT NULL DEFAULT 'TRANSFER';
