ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeTaskId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeTaskStartedAt" TIMESTAMP(3);
ALTER TABLE "EmployeeTask" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "User_activeTaskId_key" ON "User"("activeTaskId");
CREATE INDEX IF NOT EXISTS "EmployeeTask_assignedToUserId_isActive_idx" ON "EmployeeTask"("assignedToUserId", "isActive");

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_activeTaskId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_activeTaskId_fkey" FOREIGN KEY ("activeTaskId") REFERENCES "EmployeeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
