import { requireActiveWorkSession } from "@/lib/work-sessions/access";
import { EmployeeProfileClient } from "./profile-client";

/**
 * Employee profile view — read-only basics plus a "change password" deep
 * link to the existing password-change flow. Gated like the rest of the
 * portal so a clocked-out employee can't sit in the profile screen.
 */
export default async function EmployeeProfilePage() {
  await requireActiveWorkSession();
  return <EmployeeProfileClient />;
}
