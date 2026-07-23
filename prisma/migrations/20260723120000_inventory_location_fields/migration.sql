-- Additive fields for InventoryLocation (no data change)

ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "locationType" TEXT NOT NULL DEFAULT 'WAREHOUSE';
ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "targetProductCount" INTEGER;
ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "icon" TEXT;

CREATE INDEX IF NOT EXISTS "InventoryLocation_locationType_idx" ON "InventoryLocation"("locationType");
CREATE INDEX IF NOT EXISTS "InventoryLocation_isActive_idx" ON "InventoryLocation"("isActive");
