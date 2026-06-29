-- Auto-sync order deposit field into cash flow (ADDITIVE ONLY — no data change)

-- Payment method for the order's deposit field (drives cash flow display)
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "depositMethod" TEXT;

-- Marks an OrderPayment that is auto-managed from the order deposit field
ALTER TABLE "OrderPayment" ADD COLUMN IF NOT EXISTS "autoSource" TEXT;

CREATE INDEX IF NOT EXISTS "OrderPayment_autoSource_idx" ON "OrderPayment"("autoSource");
