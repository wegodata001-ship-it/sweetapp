-- Additive only: count sessions + worker name/area snapshots. No data mutation/deletion.

CREATE TABLE IF NOT EXISTS "InventoryCountSession" (
    "id" TEXT NOT NULL,
    "sessionNumber" SERIAL NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT NOT NULL DEFAULT '',
    "countDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedByUserId" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "shortageCount" INTEGER NOT NULL DEFAULT 0,
    "surplusCount" INTEGER NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "totalCountedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',

    CONSTRAINT "InventoryCountSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountSession_sessionNumber_key"
ON "InventoryCountSession"("sessionNumber");

CREATE INDEX IF NOT EXISTS "InventoryCountSession_locationId_createdAt_idx"
ON "InventoryCountSession"("locationId", "createdAt");

CREATE INDEX IF NOT EXISTS "InventoryCountSession_createdAt_idx"
ON "InventoryCountSession"("createdAt");

CREATE INDEX IF NOT EXISTS "InventoryCountSession_countedByUserId_idx"
ON "InventoryCountSession"("countedByUserId");

CREATE INDEX IF NOT EXISTS "InventoryCountSession_sessionNumber_idx"
ON "InventoryCountSession"("sessionNumber");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountSession_locationId_fkey'
  ) THEN
    ALTER TABLE "InventoryCountSession"
      ADD CONSTRAINT "InventoryCountSession_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountSession_countedByUserId_fkey'
  ) THEN
    ALTER TABLE "InventoryCountSession"
      ADD CONSTRAINT "InventoryCountSession_countedByUserId_fkey"
      FOREIGN KEY ("countedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "InventoryCount"
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

CREATE INDEX IF NOT EXISTS "InventoryCount_sessionId_idx"
ON "InventoryCount"("sessionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCount_sessionId_fkey'
  ) THEN
    ALTER TABLE "InventoryCount"
      ADD CONSTRAINT "InventoryCount_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "InventoryCountWorker"
  ADD COLUMN IF NOT EXISTS "workerDisplayName" TEXT NOT NULL DEFAULT '';

ALTER TABLE "InventoryCountWorker"
  ADD COLUMN IF NOT EXISTS "workerWorkArea" TEXT NOT NULL DEFAULT '';
