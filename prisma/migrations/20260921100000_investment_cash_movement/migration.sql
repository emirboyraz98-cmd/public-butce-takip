-- Yatırım hesabı ile cep arasındaki, alım/satıma bağlı olmayan para hareketi.
--
-- `proceedsWithdrawn` yalnızca satışın kendi anını anlatıyor: "sattım, parayı
-- bıraktım" deyip iki ay sonra o parayı çekmenin kaydedileceği yer yoktu.
-- Satışa dönüp işareti değiştirmek para girişini yanlış aya yazardı ve kısmi
-- çekimi ifade edemezdi.
CREATE TYPE "CashMovementDirection" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

CREATE TABLE "InvestmentCashMovement" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "direction"  "CashMovementDirection" NOT NULL,
  "amount"     DECIMAL(20,8) NOT NULL,
  "currency"   "BaseCurrency" NOT NULL,
  "occurredAt" DATE NOT NULL,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvestmentCashMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestmentCashMovement_userId_occurredAt_idx"
  ON "InvestmentCashMovement"("userId", "occurredAt");

ALTER TABLE "InvestmentCashMovement"
  ADD CONSTRAINT "InvestmentCashMovement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
