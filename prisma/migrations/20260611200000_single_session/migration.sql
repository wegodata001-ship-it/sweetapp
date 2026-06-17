-- Single active session per user (JWT sid must match currentSessionId)
ALTER TABLE "User" ADD COLUMN "currentSessionId" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginIp" TEXT;
ALTER TABLE "User" ADD COLUMN "lastDevice" TEXT;
