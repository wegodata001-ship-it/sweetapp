-- Personal employee notes (My Notes module)

CREATE TYPE "EmployeeNotePriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

CREATE TABLE IF NOT EXISTS "employee_notes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "priority" "EmployeeNotePriority" NOT NULL DEFAULT 'NORMAL',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_notes_userId_isCompleted_idx"
  ON "employee_notes"("userId", "isCompleted");
CREATE INDEX IF NOT EXISTS "employee_notes_userId_createdAt_idx"
  ON "employee_notes"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "employee_notes_businessId_userId_idx"
  ON "employee_notes"("businessId", "userId");

ALTER TABLE "employee_notes"
  ADD CONSTRAINT "employee_notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PERSONAL_NOTE';
