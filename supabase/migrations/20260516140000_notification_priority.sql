-- Smart Notifications: priority + extended types
DO $$ BEGIN
  CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SHIFT_LATE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHECK_DEPOSIT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FUTURE_ORDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_ALERT';

CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification" ("type");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification" ("createdAt" DESC);
