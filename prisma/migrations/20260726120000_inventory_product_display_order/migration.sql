-- Adds InventoryProduct."displayOrder" for manual (drag & drop) product ordering.
-- Strictly additive: no DROP TABLE, no DROP COLUMN, no destructive change, safe to re-run.

ALTER TABLE "InventoryProduct"
  ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- Seed the new column from the alphabetical order the UI already renders, so existing
-- data keeps the exact same visible order. Guarded so a re-run never overwrites an
-- order a user has since set by hand.
WITH ordered AS (
  SELECT "id", (ROW_NUMBER() OVER (ORDER BY "name" ASC))::int AS rn
  FROM "InventoryProduct"
)
UPDATE "InventoryProduct" p
SET "displayOrder" = o.rn
FROM ordered o
WHERE p."id" = o."id"
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryProduct" x WHERE x."displayOrder" <> 0
  );

CREATE INDEX IF NOT EXISTS "InventoryProduct_displayOrder_idx"
  ON "InventoryProduct" ("displayOrder");
