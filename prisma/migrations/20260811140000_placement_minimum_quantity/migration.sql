-- Additive: per-location minimum quantity on product↔
-- Does NOT touch InventoryCount / stock quantities / history

ALTER TABLE "InventoryProductOnLocation"
  ADD COLUMN IF NOT EXISTS "minimumQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Seed from product global minimum so existing shelves keep current behavior
-- until each location is edited independently.
UPDATE "InventoryProductOnLocation" AS pl
SET "minimumQuantity" = COALESCE(p."minimumQuantity", 0)
FROM "InventoryProduct" AS p
WHERE pl."inventoryProductId" = p."id";
