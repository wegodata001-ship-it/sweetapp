-- Additive: accounting document for manual expense receipts.
-- Does not alter expenses, income documents, Z reports, cashflow, or balances.

CREATE TABLE IF NOT EXISTS "manual_receipts" (
  "id" TEXT NOT NULL,
  "documentDate" DATE NOT NULL,
  "documentNumber" TEXT,
  "supplierName" TEXT NOT NULL,
  "supplierTaxId" TEXT,
  "documentType" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "amountBeforeVat" DECIMAL(14,2) NOT NULL,
  "vatRate" DECIMAL(8,4) NOT NULL,
  "vatAmount" DECIMAL(14,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "vatMode" TEXT NOT NULL,
  "vatDeductible" BOOLEAN NOT NULL DEFAULT false,
  "vatDeductibleAmount" DECIMAL(14,2) NOT NULL,
  "paymentMethod" TEXT,
  "attachmentUrl" TEXT,
  "attachmentPath" TEXT,
  "attachmentBucket" TEXT,
  "attachmentMime" TEXT,
  "attachmentName" TEXT,
  "linkedFinancialDocumentId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manual_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "manual_receipts_linkedFinancialDocumentId_key"
  ON "manual_receipts"("linkedFinancialDocumentId");
CREATE INDEX IF NOT EXISTS "manual_receipts_documentDate_idx" ON "manual_receipts"("documentDate");
CREATE INDEX IF NOT EXISTS "manual_receipts_supplierName_idx" ON "manual_receipts"("supplierName");
CREATE INDEX IF NOT EXISTS "manual_receipts_documentType_idx" ON "manual_receipts"("documentType");
CREATE INDEX IF NOT EXISTS "manual_receipts_vatDeductible_idx" ON "manual_receipts"("vatDeductible");

DO $$ BEGIN
  ALTER TABLE "manual_receipts"
    ADD CONSTRAINT "manual_receipts_linkedFinancialDocumentId_fkey"
    FOREIGN KEY ("linkedFinancialDocumentId") REFERENCES "FinancialDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
