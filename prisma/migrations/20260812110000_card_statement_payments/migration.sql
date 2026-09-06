-- Karta gerçekten ödenen tutar. Kayıt yoksa davranış değişmez: ekstrenin
-- tamamı ödenmiş sayılmaya devam eder.
CREATE TABLE "CreditCardStatementPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" "BaseCurrency" NOT NULL DEFAULT 'TRY',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditCardStatementPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCardStatementPayment_userId_month_currency_key"
  ON "CreditCardStatementPayment"("userId", "month", "currency");
CREATE INDEX "CreditCardStatementPayment_userId_month_idx"
  ON "CreditCardStatementPayment"("userId", "month");

ALTER TABLE "CreditCardStatementPayment"
  ADD CONSTRAINT "CreditCardStatementPayment_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
