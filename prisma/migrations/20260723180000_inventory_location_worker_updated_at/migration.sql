-- Additive only: updatedAt + optional Employee FK (no drops, no data loss)

ALTER TABLE "InventoryLocationWorker"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE "InventoryLocationWorker"
    ADD CONSTRAINT "InventoryLocationWorker_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;
