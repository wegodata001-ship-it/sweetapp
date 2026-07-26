-- Additive: product display order for inventory count Drag & Drop (backward compatible)
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "InventoryProduct_displayOrder_idx" ON "InventoryProduct"("displayOrder");
