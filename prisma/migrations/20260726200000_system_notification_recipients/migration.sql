-- Additive only: adds the system notification recipients list, the daily inventory
-- report run log, and an optional count start time.
-- No DROP, no data rewrite, no destructive change. Safe to re-run (idempotent).

-- 1) Optional count start time. NULL for every session saved before this migration,
--    so duration is simply unknown for historic rows instead of wrong.
ALTER TABLE "InventoryCountSession"
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

-- 2) Fixed recipients for system notifications, managed from the settings screen.
CREATE TABLE IF NOT EXISTS "SystemNotificationRecipient" (
  "id"            TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "label"         TEXT NOT NULL DEFAULT '',
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "allCategories" BOOLEAN NOT NULL DEFAULT true,
  "categories"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes"         TEXT,
  "lastSentAt"    TIMESTAMP(3),
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SystemNotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemNotificationRecipient_email_key"
  ON "SystemNotificationRecipient" ("email");
CREATE INDEX IF NOT EXISTS "SystemNotificationRecipient_isActive_idx"
  ON "SystemNotificationRecipient" ("isActive");
CREATE INDEX IF NOT EXISTS "SystemNotificationRecipient_createdById_idx"
  ON "SystemNotificationRecipient" ("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SystemNotificationRecipient_createdById_fkey'
  ) THEN
    ALTER TABLE "SystemNotificationRecipient"
      ADD CONSTRAINT "SystemNotificationRecipient_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) One run row per report day: makes a double cron invocation a no-op and lets a
--    failed run be retried by the next invocation.
CREATE TABLE IF NOT EXISTS "InventoryDailyReportRun" (
  "id"             TEXT NOT NULL,
  "reportDay"      TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "sessionCount"   INTEGER NOT NULL DEFAULT 0,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount"      INTEGER NOT NULL DEFAULT 0,
  "failedCount"    INTEGER NOT NULL DEFAULT 0,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "error"          TEXT,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryDailyReportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryDailyReportRun_reportDay_key"
  ON "InventoryDailyReportRun" ("reportDay");
CREATE INDEX IF NOT EXISTS "InventoryDailyReportRun_status_idx"
  ON "InventoryDailyReportRun" ("status");
CREATE INDEX IF NOT EXISTS "InventoryDailyReportRun_createdAt_idx"
  ON "InventoryDailyReportRun" ("createdAt" DESC);

-- 4) Default recipient, seeded as data so no address is hardcoded in the application.
--    Editable and removable from the settings screen like any other recipient.
INSERT INTO "SystemNotificationRecipient" ("id", "email", "label", "isActive", "allCategories", "categories")
VALUES (
  'sysnotif-default-knaansamer',
  'knaansamer@gmail.com',
  'התראות מערכת',
  true,
  true,
  ARRAY[]::TEXT[]
)
ON CONFLICT ("email") DO NOTHING;
