import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { UserRole } from "@prisma/client";
import {
  assertStrictAssignee,
  canViewAllWorkflowRuns,
  strictUserId,
} from "@/lib/auth/strict-user-isolation";

/** מנהל מערכת — יצירה, הקצאה, מחיקה, סקירה */
export function isTaskManager(session: SessionJwtPayload): boolean {
  return session.role === UserRole.SUPER_ADMIN || session.role === UserRole.ADMIN;
}

/**
 * רק SUPER_ADMIN / ADMIN (מנהל).
 * עובד עם הרשאת tasks אינו מקבל bypass — בידוד מוחלט לפי assignedToUserId.
 */
export function canManageAllTasks(session: SessionJwtPayload): boolean {
  return isTaskManager(session);
}

export function isSuperAdmin(session: SessionJwtPayload): boolean {
  return session.role === UserRole.SUPER_ADMIN;
}

/** @deprecated השתמשו ב־isTaskManager */
export function isPlatformAdmin(session: SessionJwtPayload): boolean {
  return isTaskManager(session);
}

export function hasWorkerPortal(session: SessionJwtPayload): boolean {
  return session.role === UserRole.SUPER_ADMIN || session.permissions.includes("employee_clock");
}

/** @deprecated פורטל עובד — השתמשו ב־strictUserId */
export function resolveEmployeePortalAssigneeIds(userId: string): string[] {
  return [String(userId).trim()];
}

/**
 * MANAGER ONLY — לא לשימוש בפורטל עובד.
 * @deprecated השתמשו ב־assignedToUserId בלבד
 */
export async function resolveManagerAssigneeScope(userId: string): Promise<string[]> {
  const sub = String(userId).trim();
  return [sub];
}

/** בידוד קפד — רק session.sub */
export async function viewerMayAccessTaskAssignee(
  session: SessionJwtPayload,
  assigneeField: string,
): Promise<boolean> {
  return assertStrictAssignee(session, assigneeField);
}

export { canViewAllWorkflowRuns, strictUserId };
