-- Tekrarlayan gelir/giderin son ayı (yyyy-MM, o ay dahil).
--
-- Tekrarlayan bir kaydı bitirmenin tek yolu onu silmekti; o da geçmişi
-- siliyordu. "Taşındım, marttan beri kira ödemiyorum" demek, ödenen
-- aylardaki kirayı da kayıttan düşürmek anlamına geliyordu.
--
-- NULL = hâlâ sürüyor; mevcut kayıtların anlamı değişmiyor.
ALTER TABLE "Expense" ADD COLUMN "recurrenceEndMonth" TEXT;
ALTER TABLE "IncomeEntry" ADD COLUMN "recurrenceEndMonth" TEXT;
