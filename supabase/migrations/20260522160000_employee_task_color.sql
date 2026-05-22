-- Employee task + template item colors
ALTER TABLE "EmployeeTask" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "WorkflowTemplateItem" ADD COLUMN IF NOT EXISTS "color" TEXT;
