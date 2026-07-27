-- Adds InventoryCountExclusion: soft-removal of a product from a single count round.
-- Strictly additive: creates one new table only. No DROP TABLE, no DROP COLUMN, no
-- change to existing rows or columns, and safe to re-run.
--
-- Removing a row from a count never deletes a product, a placement, an InventoryCount
-- line or a session. The exclusion is scoped to (locationKey, countDay), so the next
-- count round shows the product again.

CREATE TABLE IF NOT EXISTS "InventoryCountExclusion" (
  "id"                 TEXT NOT NULL,
  "locationKey"        TEXT NOT NULL,
  "locationId"         TEXT,
  "locationName"       TEXT NOT NULL DEFAULT '',
  "inventoryProductId" TEXT NOT NULL,
  "countDay"           TEXT NOT NULL,
  "isRemoved"          BOOLEAN NOT NULL DEFAULT true,
  "productName"        TEXT NOT NULL DEFAULT '',
  "reason"             TEXT,
  "removedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedById"        TEXT,
  "restoredAt"         TIMESTAMP(3),
  "restoredById"       TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryCountExclusion_pkey" PRIMARY KEY ("id")
);

-- One exclusion row per product per shelf per count day; re-removal updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountExclusion_locationKey_productId_countDay"
  ON "InventoryCountExclusion" ("locationKey", "inventoryProductId", "countDay");

-- Drives the count-screen filter: active exclusions for one shelf on one day.
CREATE INDEX IF NOT EXISTS "InventoryCountExclusion_locationKey_countDay_isRemoved_idx"
  ON "InventoryCountExclusion" ("locationKey", "countDay", "isRemoved");

CREATE INDEX IF NOT EXISTS "InventoryCountExclusion_inventoryProductId_idx"
  ON "InventoryCountExclusion" ("inventoryProductId");

CREATE INDEX IF NOT EXISTS "InventoryCountExclusion_locationId_idx"
  ON "InventoryCountExclusion" ("locationId");

CREATE INDEX IF NOT EXISTS "InventoryCountExclusion_removedById_idx"
  ON "InventoryCountExclusion" ("removedById");

CREATE INDEX IF NOT EXISTS "InventoryCountExclusion_removedAt_idx"
  ON "InventoryCountExclusion" ("removedAt");

-- Foreign keys added guarded, so re-running the migration cannot fail.
-- Deleting a product cascades its exclusions (the exclusion is meaningless without it);
-- deleting a location or user only nulls the reference and keeps the audit trail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InventoryCountExclusion_inventoryProductId_fkey'
  ) THEN
    ALTER TABLE "InventoryCountExclusion"
      ADD CONSTRAINT "InventoryCountExclusion_inventoryProductId_fkey"
      FOREIGN KEY ("inventoryProductId") REFERENCES "InventoryProduct"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InventoryCountExclusion_locationId_fkey'
  ) THEN
    ALTER TABLE "InventoryCountExclusion"
      ADD CONSTRAINT "InventoryCountExclusion_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InventoryCountExclusion_removedById_fkey'
  ) THEN
    ALTER TABLE "InventoryCountExclusion"
      ADD CONSTRAINT "InventoryCountExclusion_removedById_fkey"
      FOREIGN KEY ("removedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InventoryCountExclusion_restoredById_fkey'
  ) THEN
    ALTER TABLE "InventoryCountExclusion"
      ADD CONSTRAINT "InventoryCountExclusion_restoredById_fkey"
      FOREIGN KEY ("restoredById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
