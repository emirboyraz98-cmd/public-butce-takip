-- Yatırımlar artık tek tek alış/satış işlemleri olarak tutuluyor; pozisyonlar
-- (adet, ağırlıklı ortalama maliyet) bu işlemlerden türetiliyor.

CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "pricePerUnit" DECIMAL(20,8) NOT NULL,
    "currency" "BaseCurrency" NOT NULL,
    "tradedAt" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestmentTransaction_userId_symbol_assetType_idx"
    ON "InvestmentTransaction"("userId", "symbol", "assetType");
CREATE INDEX "InvestmentTransaction_userId_tradedAt_idx"
    ON "InvestmentTransaction"("userId", "tradedAt");

ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mevcut pozisyonlar kaybolmasın: her Holding satırı, o pozisyonu oluşturan
-- tek bir açılış alımı olarak işlem defterine taşınır.
INSERT INTO "InvestmentTransaction"
    ("id", "userId", "symbol", "assetType", "side", "quantity", "pricePerUnit",
     "currency", "tradedAt", "note", "createdAt", "updatedAt")
SELECT
    "id",
    "userId",
    "symbol",
    "assetType",
    'BUY'::"TradeSide",
    "quantity",
    "avgCostBasis",
    "currency",
    "createdAt"::date,
    'Devir: işlem defteri öncesi mevcut pozisyon',
    "createdAt",
    "updatedAt"
FROM "Holding";

DROP TABLE "Holding";
