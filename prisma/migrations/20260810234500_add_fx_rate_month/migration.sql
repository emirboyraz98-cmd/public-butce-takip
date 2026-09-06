-- avgUsdTryRate'in hangi ayın TCMB verisinden geldiğini kaydeder. Hedef ayın
-- kuru henüz yayınlanmadıysa yedek olarak geçmiş bir ayın ortalaması
-- kullanılır; bu sütun hangi ayın kullanıldığını arayüzde gösterebilmek için.
ALTER TABLE "MonthlySalaryResult" ADD COLUMN "fxRateMonth" TEXT;
