ALTER TABLE "EmployeeTask"
  ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;

CREATE INDEX IF NOT EXISTS "EmployeeTask_assignedToUserId_idx"
  ON "EmployeeTask" ("assignedToUserId");

CREATE INDEX IF NOT EXISTS "EmployeeTask_assignedToUserId_status_idx"
  ON "EmployeeTask" ("assignedToUserId", "status");

DO $$ BEGIN
  ALTER TABLE "EmployeeTask"
    ADD CONSTRAINT "EmployeeTask_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
