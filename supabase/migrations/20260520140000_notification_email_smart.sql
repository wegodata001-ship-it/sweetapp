-- Smart email fields on Notification + expanded user preferences

DO $$ BEGIN
  CREATE TYPE "NotificationEmailImportance" AS ENUM ('NONE', 'LOW', 'NORMAL', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "emailImportance" "NotificationEmailImportance" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSkippedReason" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_emailStatus_idx" ON "Notification"("emailStatus");
CREATE INDEX IF NOT EXISTS "Notification_recipient_email_pending_idx"
  ON "Notification"("recipientUserId", "emailStatus", "createdAt" DESC);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailMode" TEXT NOT NULL DEFAULT 'important',
  ADD COLUMN IF NOT EXISTS "emailQuietHours" BOOLEAN NOT NULL DEFAULT true;
