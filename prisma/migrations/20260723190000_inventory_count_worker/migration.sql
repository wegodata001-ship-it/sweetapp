-- Additive: per-worker counted quantities (audit trail). Does not alter existing InventoryCount rows.
CREATE TABLE IF NOT EXISTS "InventoryCountWorker" (
    "id" TEXT NOT NULL,
    "inventoryCountId" TEXT NOT NULL,
    "inventoryLocationWorkerId" TEXT NOT NULL,
    "countedQuantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCountWorker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountWorker_inventoryCountId_inventoryLocationWorkerId_key"
ON "InventoryCountWorker"("inventoryCountId", "inventoryLocationWorkerId");

CREATE INDEX IF NOT EXISTS "InventoryCountWorker_inventoryCountId_idx"
ON "InventoryCountWorker"("inventoryCountId");

CREATE INDEX IF NOT EXISTS "InventoryCountWorker_inventoryLocationWorkerId_idx"
ON "InventoryCountWorker"("inventoryLocationWorkerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountWorker_inventoryCountId_fkey'
  ) THEN
    ALTER TABLE "InventoryCountWorker"
      ADD CONSTRAINT "InventoryCountWorker_inventoryCountId_fkey"
      FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountWorker_inventoryLocationWorkerId_fkey'
  ) THEN
    ALTER TABLE "InventoryCountWorker"
      ADD CONSTRAINT "InventoryCountWorker_inventoryLocationWorkerId_fkey"
      FOREIGN KEY ("inventoryLocationWorkerId") REFERENCES "InventoryLocationWorker"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
