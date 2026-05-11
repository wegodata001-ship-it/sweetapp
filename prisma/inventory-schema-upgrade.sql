-- Upgrade legacy InventoryProduct / InventoryCount to internal-stock schema.
-- Safe to run once when migrating from countedAt/countedQuantity/notes/category/isActive.

UPDATE "InventoryProduct" SET "location" = 'לא צוין' WHERE "location" IS NULL OR trim("location") = '';

ALTER TABLE "InventoryProduct" DROP COLUMN IF EXISTS "category";
ALTER TABLE "InventoryProduct" DROP COLUMN IF EXISTS "isActive";
ALTER TABLE "InventoryProduct" DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE "InventoryCount" RENAME COLUMN "countedAt" TO "countDate";
ALTER TABLE "InventoryCount" RENAME COLUMN "countedQuantity" TO "currentQuantity";
ALTER TABLE "InventoryCount" RENAME COLUMN "notes" TO "note";

UPDATE "InventoryCount" SET "previousQuantity" = 0 WHERE "previousQuantity" IS NULL;
UPDATE "InventoryCount" SET "difference" = "currentQuantity" - "previousQuantity" WHERE "difference" IS NULL;

ALTER TABLE "InventoryCount" ALTER COLUMN "previousQuantity" SET NOT NULL;
ALTER TABLE "InventoryCount" ALTER COLUMN "difference" SET NOT NULL;

ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);
UPDATE "InventoryCount" SET "createdAt" = "countDate" WHERE "createdAt" IS NULL;
ALTER TABLE "InventoryCount" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "InventoryCount" ALTER COLUMN "createdAt" SET NOT NULL;

ALTER TABLE "InventoryProduct" ALTER COLUMN "location" SET NOT NULL;

DROP INDEX IF EXISTS "InventoryCount_countedAt_idx";
