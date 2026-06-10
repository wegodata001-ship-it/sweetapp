-- Safe, idempotent apply for accountant email feature (no data deletion)

ALTER TABLE "FinancialDocument" ADD COLUMN IF NOT EXISTS "sentToCpaEmail" TEXT;

CREATE TABLE IF NOT EXISTS "AccountantEmailLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentTo" TEXT NOT NULL,
    "sentById" TEXT,
    "attachmentsCount" INTEGER NOT NULL,
    "subject" TEXT,
    "message" TEXT,
    "resendId" TEXT,
    CONSTRAINT "AccountantEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountantEmailLog_documentId_idx" ON "AccountantEmailLog"("documentId");
CREATE INDEX IF NOT EXISTS "AccountantEmailLog_sentById_idx" ON "AccountantEmailLog"("sentById");
CREATE INDEX IF NOT EXISTS "AccountantEmailLog_sentAt_idx" ON "AccountantEmailLog"("sentAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountantEmailLog_documentId_fkey'
  ) THEN
    ALTER TABLE "AccountantEmailLog"
      ADD CONSTRAINT "AccountantEmailLog_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "FinancialDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountantEmailLog_sentById_fkey'
  ) THEN
    ALTER TABLE "AccountantEmailLog"
      ADD CONSTRAINT "AccountantEmailLog_sentById_fkey"
      FOREIGN KEY ("sentById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
