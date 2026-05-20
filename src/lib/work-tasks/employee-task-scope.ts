import type { Prisma } from "@prisma/client";
import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { strictEmployeeUserId } from "@/lib/auth/employee-scope";

/** WHERE לעובד — רק משימות שהוקצו למשתמש המחובר */
export function employeeTaskWhereForUser(
  session: SessionJwtPayload,
): Prisma.EmployeeTaskWhereInput {
  const userId = strictEmployeeUserId(session);
  return { assignedToUserId: userId };
}
