-- Gmail üzerinden otomatik harcama aktarımı: onay bekleyen kayıtlar + erişim anahtarı.

CREATE TYPE "ImportSource" AS ENUM ('AKBANK_EMAIL');
CREATE TYPE "ImportedTransactionKind" AS ENUM ('PURCHASE', 'CANCELLATION');
CREATE TYPE "ImportedTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Ekstre kesim günü. Sabit ay kaydırması (creditCardPaymentMonthOffset) erken
-- ay harcamalarını yanlış ekstreye atıyordu; kesim günü gün bazında ayırıyor.
ALTER TABLE "User" ADD COLUMN "creditCardStatementDay" INTEGER NOT NULL DEFAULT 4;

CREATE TABLE "ImportToken" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "label"      TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImportToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportToken_userId_idx" ON "ImportToken"("userId");

ALTER TABLE "ImportToken"
  ADD CONSTRAINT "ImportToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ImportedTransaction" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "source"              "ImportSource" NOT NULL DEFAULT 'AKBANK_EMAIL',
  "status"              "ImportedTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "kind"                "ImportedTransactionKind" NOT NULL DEFAULT 'PURCHASE',
  "externalId"          TEXT NOT NULL,
  "occurredAt"          DATE NOT NULL,
  "rawAmount"           DECIMAL(14,2) NOT NULL,
  "rawCurrency"         TEXT NOT NULL,
  "amount"              DECIMAL(14,2),
  "currency"            "BaseCurrency",
  "fxRate"              DECIMAL(18,8),
  "sector"              TEXT NOT NULL,
  "cardLast4"           TEXT NOT NULL,
  "installmentCount"    INTEGER NOT NULL DEFAULT 1,
  "suggestedCategoryId" TEXT,
  "paymentMonth"        TEXT,
  "expenseId"           TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ImportedTransaction_pkey" PRIMARY KEY ("id")
);

-- Tekilleştirmenin dayanağı: aynı Gmail mesajı iki kez gönderilse de tek kayıt.
CREATE UNIQUE INDEX "ImportedTransaction_userId_externalId_key"
  ON "ImportedTransaction"("userId", "externalId");

CREATE INDEX "ImportedTransaction_userId_status_idx"
  ON "ImportedTransaction"("userId", "status");

ALTER TABLE "ImportedTransaction"
  ADD CONSTRAINT "ImportedTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
