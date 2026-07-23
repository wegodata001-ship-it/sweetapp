-- Additive only — no data loss, no table drops
ALTER TABLE "InventoryLocationWorker" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "InventoryLocationWorker" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "InventoryLocationWorker_isActive_idx"
  ON "InventoryLocationWorker"("isActive");
CREATE INDEX IF NOT EXISTS "InventoryLocationWorker_employeeId_idx"
  ON "InventoryLocationWorker"("employeeId");
