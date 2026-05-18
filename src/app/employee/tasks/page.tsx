import { requireActiveWorkSession } from "@/lib/work-sessions/access";
import { EmployeeTasksClient } from "./tasks-client";

/**
 * Legacy "My Tasks" (simple checklist) — kept for backward compatibility but
 * gated behind an active work-session like every other employee surface.
 */
export default async function EmployeeTasksPage() {
  await requireActiveWorkSession();
  return <EmployeeTasksClient />;
}
