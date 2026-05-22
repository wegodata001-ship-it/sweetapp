-- AlterTable: FinancialDocument — קישור ספק/עובד
ALTER TABLE "FinancialDocument" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "FinancialDocument" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;

-- AlterTable: FinancialDocumentItem — הערת שורה
ALTER TABLE "FinancialDocumentItem" ADD COLUMN IF NOT EXISTS "lineNote" TEXT;

-- AlterTable: LedgerEntry — קישור למסמך הוצאה
ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "financialDocumentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_financialDocumentId_key" ON "LedgerEntry"("financialDocumentId");
CREATE INDEX IF NOT EXISTS "FinancialDocument_supplierId_idx" ON "FinancialDocument"("supplierId");
CREATE INDEX IF NOT EXISTS "FinancialDocument_employeeId_idx" ON "FinancialDocument"("employeeId");

DO $$ BEGIN
  ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_financialDocumentId_fkey"
    FOREIGN KEY ("financialDocumentId") REFERENCES "FinancialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
