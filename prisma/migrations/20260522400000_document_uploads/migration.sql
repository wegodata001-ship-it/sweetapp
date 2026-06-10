-- CreateTable
CREATE TABLE IF NOT EXISTS "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "publicUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "financialDocumentId" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "documents_financialDocumentId_key" ON "documents"("financialDocumentId");
CREATE INDEX IF NOT EXISTS "documents_documentType_idx" ON "documents"("documentType");
CREATE INDEX IF NOT EXISTS "documents_uploadedAt_idx" ON "documents"("uploadedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_financialDocumentId_fkey'
  ) THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_financialDocumentId_fkey"
      FOREIGN KEY ("financialDocumentId") REFERENCES "FinancialDocument"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
