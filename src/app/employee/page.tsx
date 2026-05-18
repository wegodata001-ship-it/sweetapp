import { requireActiveWorkSession } from "@/lib/work-sessions/access";
import { EmployeeDashboard } from "./employee-dashboard";

/**
 * Employee home / dashboard.
 *
 * Server component that enforces the clock-in gate: any EMPLOYEE without an
 * active WorkSession is bounced to `/employee/clock`. Admins / super-admins
 * bypass the gate and see the live dashboard for their own session (useful
 * for QA & coaching).
 */
export default async function EmployeeHomePage() {
  await requireActiveWorkSession();
  return <EmployeeDashboard />;
}
