-- Soft delete for workflow task groups (templates) and related runs
ALTER TABLE "WorkflowTemplate" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "WorkflowTemplate_deletedAt_idx" ON "WorkflowTemplate"("deletedAt");
CREATE INDEX IF NOT EXISTS "WorkflowRun_deletedAt_idx" ON "WorkflowRun"("deletedAt");
