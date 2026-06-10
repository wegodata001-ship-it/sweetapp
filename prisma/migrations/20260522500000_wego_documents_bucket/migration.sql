-- AlterTable: private bucket metadata + fileType for document archive
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "storageBucket" TEXT NOT NULL DEFAULT 'wego-documents';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "fileType" TEXT;

UPDATE "documents" SET "fileType" = "mimeType" WHERE "fileType" IS NULL AND "mimeType" IS NOT NULL;
