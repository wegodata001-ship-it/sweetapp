-- Additive: per-weekday minimum quantities on product↔location placement.
-- null = not set (fallback chain). 0 = explicit minimum of zero.
-- Does NOT touch InventoryCount quantities, currentQuantity, or legacy minimumQuantity semantics.

ALTER TABLE "InventoryProductOnLocation"
  ADD COLUMN IF NOT EXISTS "minimumSun" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minimumMon" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minimumTue" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minimumWed" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minimumThu" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minimumFri" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minimumSat" DOUBLE PRECISION;

-- Safe backfill per column: legacy placement minimum only where weekday column is still NULL.
UPDATE "InventoryProductOnLocation" SET "minimumSun" = "minimumQuantity" WHERE "minimumSun" IS NULL;
UPDATE "InventoryProductOnLocation" SET "minimumMon" = "minimumQuantity" WHERE "minimumMon" IS NULL;
UPDATE "InventoryProductOnLocation" SET "minimumTue" = "minimumQuantity" WHERE "minimumTue" IS NULL;
UPDATE "InventoryProductOnLocation" SET "minimumWed" = "minimumQuantity" WHERE "minimumWed" IS NULL;
UPDATE "InventoryProductOnLocation" SET "minimumThu" = "minimumQuantity" WHERE "minimumThu" IS NULL;
UPDATE "InventoryProductOnLocation" SET "minimumFri" = "minimumQuantity" WHERE "minimumFri" IS NULL;
UPDATE "InventoryProductOnLocation" SET "minimumSat" = "minimumQuantity" WHERE "minimumSat" IS NULL;
