-- Additive: snapshot minimum quantity on each count line (product + location + session/day)
-- Does NOT delete or mutate existing quantities / history beyond filling the new column

ALTER TABLE "InventoryCount"
  ADD COLUMN IF NOT EXISTS "minimumQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill from per-location placement minimum, else product global minimum
UPDATE "InventoryCount" AS c
SET "minimumQuantity" = COALESCE(pl."minimumQuantity", p."minimumQuantity", 0)
FROM "InventoryProduct" AS p
LEFT JOIN "InventoryProductOnLocation" AS pl
  ON pl."inventoryProductId" = c."inventoryProductId"
 AND pl."locationId" = c."locationId"
WHERE c."inventoryProductId" = p."id"
  AND c."minimumQuantity" = 0;
