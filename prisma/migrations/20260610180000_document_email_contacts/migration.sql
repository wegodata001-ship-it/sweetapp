-- Document email contacts + enhanced accountant email audit

CREATE TABLE IF NOT EXISTS "document_email_contacts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "email" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_email_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_email_contacts_businessId_email_key"
  ON "document_email_contacts"("businessId", "email");
CREATE INDEX IF NOT EXISTS "document_email_contacts_businessId_isFavorite_idx"
  ON "document_email_contacts"("businessId", "isFavorite");
CREATE INDEX IF NOT EXISTS "document_email_contacts_businessId_lastUsedAt_idx"
  ON "document_email_contacts"("businessId", "lastUsedAt");

ALTER TABLE "AccountantEmailLog" ADD COLUMN IF NOT EXISTS "recipientEmails" TEXT;
ALTER TABLE "AccountantEmailLog" ADD COLUMN IF NOT EXISTS "documentsCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AccountantEmailLog" ADD COLUMN IF NOT EXISTS "attachmentMode" TEXT;
ALTER TABLE "AccountantEmailLog" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

CREATE INDEX IF NOT EXISTS "AccountantEmailLog_batchId_idx" ON "AccountantEmailLog"("batchId");
