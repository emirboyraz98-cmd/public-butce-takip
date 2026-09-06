-- Kategori başına aylık bütçe sınırı.
--
-- NULL bırakılıyor ve varsayılan verilmiyor: "sınır konmamış" ile "sınır 0"
-- farklı durumlar. Sıfır, o kategoriye hiç harcama yapmama niyeti; NULL ise
-- kategorinin bütçe takibine hiç girmediği anlamına geliyor ve toplama
-- katılmıyor. Varsayılan 0 verilseydi mevcut bütün kategoriler bir anda
-- "bütçesi aşılmış" görünürdü.
ALTER TABLE "ExpenseCategory"
  ADD COLUMN "monthlyLimit" DECIMAL(12,2);
