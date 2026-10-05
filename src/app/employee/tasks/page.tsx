import { EmployeeTasksClient } from "./tasks-client";

/**
 * My Tasks shell. Auth is enforced in middleware (JWT, no DB).
 * Shift + task data come from one /api/work/my-tasks snapshot so this
 * RSC does not add sequential DB round-trips before first paint.
 */
export default function EmployeeTasksPage() {
  return <EmployeeTasksClient />;
}
