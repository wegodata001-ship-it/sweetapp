import { requireActiveWorkSession } from "@/lib/work-sessions/access";
import { EmployeeHoursClient } from "./hours-client";

/**
 * Employee Hours page — current day clock-in/out plus a history table of
 * recent days. Gated behind an active work-session like the rest of the
 * employee portal.
 */
export default async function EmployeeHoursPage() {
  await requireActiveWorkSession();
  return <EmployeeHoursClient />;
}
