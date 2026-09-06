-- Maaşın hak edildiği aydan kaç ay sonra ödendiği. Genel Bakış nakit akışını
-- gösterdiği için maaşı bu kadar ileri kaydırır. 0 = aynı ay (mevcut davranış,
-- yani var olan kullanıcıların grafiği değişmez).
ALTER TABLE "User" ADD COLUMN "salaryPaymentMonthOffset" INTEGER NOT NULL DEFAULT 0;
