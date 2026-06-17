-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "lastFetchedPrice" DECIMAL(12,4),
ADD COLUMN     "priceFetchError" TEXT,
ADD COLUMN     "priceFetchStatus" TEXT,
ADD COLUMN     "priceSource" TEXT,
ADD COLUMN     "priceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "priceFetchEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceParser" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dashboardConfig" JSONB;

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" DECIMAL(12,4),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_itemId_idx" ON "PriceHistory"("itemId");

-- CreateIndex
CREATE INDEX "PriceHistory_fetchedAt_idx" ON "PriceHistory"("fetchedAt");

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
