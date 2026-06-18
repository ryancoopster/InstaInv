-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "boxId" TEXT;

-- CreateIndex
CREATE INDEX "Item_boxId_idx" ON "Item"("boxId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing items inherit their box from the drawer they live in.
UPDATE "Item" i SET "boxId" = d."boxId"
FROM "Drawer" d
WHERE i."drawerId" = d.id AND i."boxId" IS NULL;
