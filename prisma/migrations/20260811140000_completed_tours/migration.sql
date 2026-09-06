-- Tanıtım turunun hangi sayfalarda tamamlandığını kullanıcı bazında tutar;
-- böylece tur sayfa başına yalnızca bir kez gösterilir.
ALTER TABLE "User" ADD COLUMN "completedTours" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
