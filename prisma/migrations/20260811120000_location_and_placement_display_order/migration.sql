-- Additive: location order (Drag & Drop) + per-location product order
-- Does NOT touch InventoryCount / sessions / historical quantities

ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "InventoryLocation_displayOrder_idx" ON "InventoryLocation"("displayOrder");

ALTER TABLE "InventoryProductOnLocation" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "InventoryProductOnLocation_locationId_displayOrder_idx"
  ON "InventoryProductOnLocation"("locationId", "displayOrder");
