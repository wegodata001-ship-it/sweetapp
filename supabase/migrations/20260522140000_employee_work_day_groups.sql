-- Employee work day: groups + task fields
ALTER TABLE "EmployeeWorkSession" ADD COLUMN IF NOT EXISTS "workDate" DATE NOT NULL DEFAULT CURRENT_DATE;
CREATE INDEX IF NOT EXISTS "EmployeeWorkSession_employeeId_workDate_idx" ON "EmployeeWorkSession"("employeeId", "workDate");

CREATE TABLE IF NOT EXISTS "EmployeeTaskGroup" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "assignedToUserId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "color" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "sourceWorkTemplateId" TEXT,
  "sourceWorkflowTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeTaskGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeTaskGroup" ADD CONSTRAINT "EmployeeTaskGroup_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTaskGroup" ADD CONSTRAINT "EmployeeTaskGroup_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTaskGroup" ADD CONSTRAINT "EmployeeTaskGroup_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "EmployeeWorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "EmployeeTaskGroup_employeeId_workDate_idx" ON "EmployeeTaskGroup"("employeeId", "workDate");
CREATE INDEX IF NOT EXISTS "EmployeeTaskGroup_assignedToUserId_workDate_idx" ON "EmployeeTaskGroup"("assignedToUserId", "workDate");
CREATE INDEX IF NOT EXISTS "EmployeeTaskGroup_sessionId_idx" ON "EmployeeTaskGroup"("sessionId");

ALTER TABLE "EmployeeTask" ADD COLUMN IF NOT EXISTS "taskGroupId" TEXT;
ALTER TABLE "EmployeeTask" ADD COLUMN IF NOT EXISTS "materials" TEXT;
ALTER TABLE "EmployeeTask" ADD COLUMN IF NOT EXISTS "targetDueAt" TIMESTAMP(3);

ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_taskGroupId_fkey"
  FOREIGN KEY ("taskGroupId") REFERENCES "EmployeeTaskGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "EmployeeTask_taskGroupId_idx" ON "EmployeeTask"("taskGroupId");
