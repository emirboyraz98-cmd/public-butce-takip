-- Tek bir günün tipini elle geçersiz kılan istisnalar.
-- Döneme değil tarihe bağlanır; dönem sınırları düzenlendiğinde istisna
-- anlamını korur. Kullanıcı başına gün başına en fazla bir istisna olur.
CREATE TYPE "SalaryDayType" AS ENUM ('NORMAL', 'SUNDAY', 'PUBLIC_HOLIDAY', 'LEAVE');

CREATE TABLE "SalaryDayException" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "dayType"   "SalaryDayType" NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalaryDayException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalaryDayException_userId_date_key"
  ON "SalaryDayException"("userId", "date");
CREATE INDEX "SalaryDayException_userId_date_idx"
  ON "SalaryDayException"("userId", "date");

ALTER TABLE "SalaryDayException"
  ADD CONSTRAINT "SalaryDayException_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
