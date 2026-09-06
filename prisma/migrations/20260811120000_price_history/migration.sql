-- PriceSnapshot yalnızca güncel fiyatı tutup üzerine yazdığı için geçmiş
-- ayların piyasa değeri hesaplanamıyordu. Bu tablo her fiyat yenilemesinde
-- o günün fiyatını arşivler.
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceHistory_symbol_assetType_date_key"
    ON "PriceHistory"("symbol", "assetType", "date");
CREATE INDEX "PriceHistory_symbol_assetType_date_idx"
    ON "PriceHistory"("symbol", "assetType", "date");

-- Elde bulunan güncel fiyatlar, bugünün arşiv kaydı olarak devredilir ki
-- grafik hemen bir noktayla başlayabilsin.
INSERT INTO "PriceHistory" ("id", "symbol", "assetType", "date", "price", "currency")
SELECT "id", "symbol", "assetType", "fetchedAt"::date, "price", "currency"
FROM "PriceSnapshot"
ON CONFLICT ("symbol", "assetType", "date") DO NOTHING;
