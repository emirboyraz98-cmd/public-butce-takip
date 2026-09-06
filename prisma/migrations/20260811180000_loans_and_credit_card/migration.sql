-- Giderler üç sekmeye ayrılıyor: Diğer Giderler / Kredi Kartı / Krediler.
-- Mevcut tüm giderler "Diğer Giderler"e denk gelir; kind varsayılanı OTHER
-- olduğu için veri taşınmasına gerek yoktur.

CREATE TYPE "ExpenseKind" AS ENUM ('OTHER', 'CREDIT_CARD');

ALTER TABLE "Expense"
  ADD COLUMN "kind" "ExpenseKind" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "paymentMonth" TEXT;

CREATE INDEX "Expense_userId_kind_idx" ON "Expense"("userId", "kind");

ALTER TABLE "User"
  ADD COLUMN "creditCardPaymentMonthOffset" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "Loan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" "BaseCurrency" NOT NULL DEFAULT 'TRY',
  "startMonth" TEXT NOT NULL,
  "endMonth" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Loan_userId_idx" ON "Loan"("userId");

ALTER TABLE "Loan"
  ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoanPeriod" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "effectiveFrom" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoanPeriod_loanId_effectiveFrom_key" ON "LoanPeriod"("loanId", "effectiveFrom");
CREATE INDEX "LoanPeriod_loanId_effectiveFrom_idx" ON "LoanPeriod"("loanId", "effectiveFrom");

ALTER TABLE "LoanPeriod"
  ADD CONSTRAINT "LoanPeriod_loanId_fkey" FOREIGN KEY ("loanId")
  REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
