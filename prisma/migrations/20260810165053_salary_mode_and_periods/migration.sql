-- CreateEnum
CREATE TYPE "SalaryMode" AS ENUM ('FIXED', 'VARIABLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "salaryMode" "SalaryMode" NOT NULL DEFAULT 'VARIABLE';

-- AlterTable (amountUsd -> amount, veri korunur)
ALTER TABLE "BaseSalaryRate" RENAME COLUMN "amountUsd" TO "amount";
ALTER TABLE "BaseSalaryRate" ADD COLUMN "currency" "BaseCurrency" NOT NULL DEFAULT 'USD';
ALTER TABLE "BaseSalaryRate" ADD COLUMN "effectiveTo" DATE;

-- AlterTable
ALTER TABLE "ReferenceFxRate" ADD COLUMN "effectiveTo" DATE;

-- AlterTable (usdNominalTotal -> nominalTotal, usdTotal -> total, veri korunur)
ALTER TABLE "MonthlySalaryResult" RENAME COLUMN "usdNominalTotal" TO "nominalTotal";
ALTER TABLE "MonthlySalaryResult" RENAME COLUMN "usdTotal" TO "total";
ALTER TABLE "MonthlySalaryResult" ADD COLUMN "actualAmount" DECIMAL(14,2);
ALTER TABLE "MonthlySalaryResult" ADD COLUMN "mode" "SalaryMode" NOT NULL DEFAULT 'VARIABLE';
ALTER TABLE "MonthlySalaryResult" ADD COLUMN "currency" "BaseCurrency" NOT NULL DEFAULT 'USD';
ALTER TABLE "MonthlySalaryResult" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "MonthlySalaryResult" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "MonthlySalaryResult" ALTER COLUMN "avgUsdTryRate" DROP NOT NULL;
ALTER TABLE "MonthlySalaryResult" ALTER COLUMN "referenceRate" DROP NOT NULL;
ALTER TABLE "MonthlySalaryResult" ALTER COLUMN "breakdown" DROP NOT NULL;
