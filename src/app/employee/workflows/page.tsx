import { requireActiveWorkSession } from "@/lib/work-sessions/access";
import { EmployeeWorkflowsClient } from "./workflows-client";

/**
 * /employee/workflows — "My Tasks" runner. The actual sequential-steps UI
 * lives in the client component; this server wrapper just enforces the
 * clock-in gate so an off-shift employee can't access the workflow runner.
 */
export default async function EmployeeWorkflowsPage() {
  await requireActiveWorkSession();
  return <EmployeeWorkflowsClient />;
}
