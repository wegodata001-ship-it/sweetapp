import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { UserRole } from "@prisma/client";
import { canManageAllTasks } from "@/lib/tasks/task-access";

/** מזהה משתמש יחיד לפורטל עובד — ללא "אחים" על אותו כרטיס Employee */
export function strictEmployeeUserId(session: SessionJwtPayload): string {
  return String(session.sub).trim();
}

/** האם זה API פורטל עובד (לא מנהל) */
export function isEmployeePortalSession(session: SessionJwtPayload): boolean {
  if (session.role === UserRole.EMPLOYEE) return true;
  if (canManageAllTasks(session)) return false;
  return session.permissions.includes("employee_clock");
}

/** מנהלים לא אמורים לקרוא ל-API עובד ולקבל נתוני עובד אחר */
export function mustUseEmployeePortalScope(session: SessionJwtPayload): boolean {
  return isEmployeePortalSession(session) && !canManageAllTasks(session);
}

export function logEmployeeTaskAccess(
  tag: string,
  session: SessionJwtPayload,
  extra: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(tag, {
    currentUser: session.sub,
    role: session.role,
    ...extra,
  });
}
