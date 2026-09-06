-- Uygulamaya başlamadan önce sahip olunan pozisyonlar nakit akışına girmez.
ALTER TABLE "InvestmentTransaction"
  ADD COLUMN "isOpening" BOOLEAN NOT NULL DEFAULT false;
