-- Multi-location inventory products + location-scoped counts (ADDITIVE)

-- 1) Worker fields on InventoryProduct
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "worker1Name" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "worker1Location" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "worker2Name" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "worker2Location" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "worker3Name" TEXT;
ALTER TABLE "InventoryProduct" ADD COLUMN IF NOT EXISTS "worker3Location" TEXT;

-- 2) Location on InventoryCount (nullable — old rows stay valid)
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

CREATE INDEX IF NOT EXISTS "InventoryCount_locationId_idx" ON "InventoryCount"("locationId");
CREATE INDEX IF NOT EXISTS "InventoryCount_inventoryProductId_locationId_idx"
  ON "InventoryCount"("inventoryProductId", "locationId");

DO $$ BEGIN
  ALTER TABLE "InventoryCount"
    ADD CONSTRAINT "InventoryCount_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) N:M join table
CREATE TABLE IF NOT EXISTS "InventoryProductOnLocation" (
  "id" TEXT NOT NULL,
  "inventoryProductId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryProductOnLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryProductOnLocation_inventoryProductId_locationId_key"
  ON "InventoryProductOnLocation"("inventoryProductId", "locationId");
CREATE INDEX IF NOT EXISTS "InventoryProductOnLocation_locationId_idx"
  ON "InventoryProductOnLocation"("locationId");
CREATE INDEX IF NOT EXISTS "InventoryProductOnLocation_inventoryProductId_idx"
  ON "InventoryProductOnLocation"("inventoryProductId");

DO $$ BEGIN
  ALTER TABLE "InventoryProductOnLocation"
    ADD CONSTRAINT "InventoryProductOnLocation_inventoryProductId_fkey"
    FOREIGN KEY ("inventoryProductId") REFERENCES "InventoryProduct"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryProductOnLocation"
    ADD CONSTRAINT "InventoryProductOnLocation_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Backfill placements from existing primary locationId (no data loss)
INSERT INTO "InventoryProductOnLocation" ("id", "inventoryProductId", "locationId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  p."id",
  p."locationId",
  CURRENT_TIMESTAMP
FROM "InventoryProduct" p
WHERE p."locationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryProductOnLocation" j
    WHERE j."inventoryProductId" = p."id" AND j."locationId" = p."locationId"
  );

-- Also link by matching location name text when FK missing but location row exists
INSERT INTO "InventoryProductOnLocation" ("id", "inventoryProductId", "locationId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id"),
  p."id",
  l."id",
  CURRENT_TIMESTAMP
FROM "InventoryProduct" p
JOIN "InventoryLocation" l
  ON lower(trim(l."name")) = lower(trim(p."location"))
WHERE p."location" IS NOT NULL
  AND trim(p."location") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryProductOnLocation" j
    WHERE j."inventoryProductId" = p."id" AND j."locationId" = l."id"
  );

-- 5) Backfill count.locationId from product's primary location (best-effort)
UPDATE "InventoryCount" c
SET "locationId" = p."locationId"
FROM "InventoryProduct" p
WHERE c."inventoryProductId" = p."id"
  AND c."locationId" IS NULL
  AND p."locationId" IS NOT NULL;
