-- Kart harcamaları için toplam aylık sınır. Kategori sınırlarıyla (
-- ExpenseCategory.monthlyLimit) aynı fikir, ama kategori kırılımından
-- bağımsız: "kartla bu ay 40.000'i geçmeyeyim".
--
-- NULL = sınır konmamış; arayüz limit bölümünü hiç göstermez. 0 geçerli bir
-- değerdir ve "kartı hiç kullanmayacağım" demektir — sınır yokluğundan farklı.
ALTER TABLE "User"
  ADD COLUMN "creditCardMonthlyLimit" DECIMAL(12,2);
