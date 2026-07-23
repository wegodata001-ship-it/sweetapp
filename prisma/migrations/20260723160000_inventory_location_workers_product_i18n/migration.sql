-- Dynamic location workers + product i18n / barcode / sku / max

CREATE TABLE IF NOT EXISTS "InventoryLocationWorker" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "area" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryLocationWorker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryLocationWorker_locationId_sortOrder_idx"
  ON "InventoryLocationWorker"("locationId", "sortOrder");
CREATE INDEX IF NOT EXISTS "InventoryLocationWorker_locationId_idx"
  ON "InventoryLocationWorker"("locationId");

DO $$ BEGIN
  ALTER TABLE "InventoryLocationWorker"
    ADD CONSTRAINT "InventoryLocationWorker_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "nameHe" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "maximumQuantity" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "InventoryProduct_barcode_idx" ON "InventoryProduct"("barcode");
CREATE INDEX IF NOT EXISTS "InventoryProduct_sku_idx" ON "InventoryProduct"("sku");

-- Backfill Hebrew name from existing name
UPDATE "InventoryProduct"
SET "nameHe" = "name"
WHERE "nameHe" IS NULL;

-- Seed location workers from legacy product worker fields (unique by location + name)
INSERT INTO "InventoryLocationWorker" ("id", "locationId", "name", "area", "sortOrder", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."locationId" || w.name),
  p."locationId",
  w.name,
  COALESCE(w.area, ''),
  w.ord,
  CURRENT_TIMESTAMP
FROM "InventoryProduct" p
CROSS JOIN LATERAL (
  VALUES
    (1, NULLIF(trim(p."worker1Name"), ''), NULLIF(trim(p."worker1Location"), '')),
    (2, NULLIF(trim(p."worker2Name"), ''), NULLIF(trim(p."worker2Location"), '')),
    (3, NULLIF(trim(p."worker3Name"), ''), NULLIF(trim(p."worker3Location"), ''))
) AS w(ord, name, area)
WHERE p."locationId" IS NOT NULL
  AND w.name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryLocationWorker" x
    WHERE x."locationId" = p."locationId"
      AND lower(trim(x."name")) = lower(trim(w.name))
  );
