-- Performance indexes for employee work + notifications
CREATE INDEX IF NOT EXISTS "EmployeeTask_employeeId_sessionId_taskGroupId_idx"
  ON "EmployeeTask" ("employeeId", "sessionId", "taskGroupId");

CREATE INDEX IF NOT EXISTS "EmployeeTask_taskGroupId_orderIndex_idx"
  ON "EmployeeTask" ("taskGroupId", "orderIndex");

CREATE INDEX IF NOT EXISTS "EmployeeTaskGroup_employeeId_workDate_orderIndex_idx"
  ON "EmployeeTaskGroup" ("employeeId", "workDate", "orderIndex");
