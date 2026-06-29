-- System Reconciliation (בקרות → התאמת מערכות)
-- שלב ראשון: השוואה ובקרה בלבד — אין שינוי בהזמנות קיימות.

-- שדות חדשים בטבלת ההזמנות (FutureOrder) — נשארים NULL עד שמתבצע ייבוא/שיוך
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "customerCode" TEXT;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "weekCode" TEXT;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "turkeyOrderId" TEXT;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "turkeyCustomerCode" TEXT;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "turkeyCustomerName" TEXT;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "turkeyAmount" DOUBLE PRECISION;
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "turkeyImportDate" TIMESTAMP(3);
ALTER TABLE "FutureOrder" ADD COLUMN IF NOT EXISTS "turkeySyncWeek" TEXT;

CREATE INDEX IF NOT EXISTS "FutureOrder_customerCode_idx" ON "FutureOrder"("customerCode");
CREATE INDEX IF NOT EXISTS "FutureOrder_weekCode_idx" ON "FutureOrder"("weekCode");
CREATE INDEX IF NOT EXISTS "FutureOrder_country_idx" ON "FutureOrder"("country");

-- טבלת כותרת ייבוא
CREATE TABLE IF NOT EXISTS "system_reconciliation_imports" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "weekCode" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_reconciliation_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_reconciliation_imports_country_idx" ON "system_reconciliation_imports"("country");
CREATE INDEX IF NOT EXISTS "system_reconciliation_imports_weekCode_idx" ON "system_reconciliation_imports"("weekCode");
CREATE INDEX IF NOT EXISTS "system_reconciliation_imports_importedAt_idx" ON "system_reconciliation_imports"("importedAt");

-- טבלת שורות ביניים
CREATE TABLE IF NOT EXISTS "system_reconciliation_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "weekCode" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "externalCustomerCode" TEXT,
    "externalCustomerName" TEXT,
    "externalAmount" DOUBLE PRECISION,
    "externalDate" TIMESTAMP(3),
    "matchedOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "differenceAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_reconciliation_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_reconciliation_rows_importId_idx" ON "system_reconciliation_rows"("importId");
CREATE INDEX IF NOT EXISTS "system_reconciliation_rows_status_idx" ON "system_reconciliation_rows"("status");
CREATE INDEX IF NOT EXISTS "system_reconciliation_rows_externalCustomerCode_idx" ON "system_reconciliation_rows"("externalCustomerCode");

-- מפתחות זרים
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_reconciliation_imports_importedById_fkey'
  ) THEN
    ALTER TABLE "system_reconciliation_imports"
      ADD CONSTRAINT "system_reconciliation_imports_importedById_fkey"
      FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_reconciliation_rows_importId_fkey'
  ) THEN
    ALTER TABLE "system_reconciliation_rows"
      ADD CONSTRAINT "system_reconciliation_rows_importId_fkey"
      FOREIGN KEY ("importId") REFERENCES "system_reconciliation_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
