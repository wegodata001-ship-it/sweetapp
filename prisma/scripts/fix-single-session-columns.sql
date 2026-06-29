-- Repair: single_session migration was recorded as applied but the columns
-- never physically existed on this database. Add them idempotently.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentSessionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastDevice" TEXT;
