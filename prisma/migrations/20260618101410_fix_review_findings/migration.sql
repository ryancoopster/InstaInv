-- AlterTable
ALTER TABLE "PendingDecisionNotification" ADD COLUMN     "sentBatchId" TEXT;

-- CreateIndex
CREATE INDEX "PendingDecisionNotification_sentBatchId_idx" ON "PendingDecisionNotification"("sentBatchId");

-- DM-7: at most one OPEN order request per item, so the buy-list / generate-shortfalls
-- cannot race into duplicate requests. Free-text requests (itemId IS NULL) are exempt.
CREATE UNIQUE INDEX "OrderRequest_open_item_unique"
  ON "OrderRequest"("itemId")
  WHERE "itemId" IS NOT NULL AND "status" IN ('REQUESTED', 'APPROVED', 'ORDERED');

-- DM-1: repair any Item whose denormalized boxId drifted from its drawer's box
-- (safety backfill; the create/update paths are being fixed to keep it consistent).
UPDATE "Item" i
  SET "boxId" = d."boxId"
  FROM "Drawer" d
  WHERE i."drawerId" = d.id
    AND i."boxId" IS DISTINCT FROM d."boxId";
