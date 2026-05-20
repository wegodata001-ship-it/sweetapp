import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { UserRole } from "@prisma/client";
import { canManageAllTasks } from "@/lib/tasks/task-access";

/** פורטל עובד = בידוד מוחלט לפי User.id — ללא כרטיס Employee משותף */
export function isEmployeeRole(session: SessionJwtPayload): boolean {
  return session.role === UserRole.EMPLOYEE;
}

/**
 * רשימת כל ה-workflow runs במערכת — רק מנהלים (לא EMPLOYEE).
 * עובד עם הרשאת tasks עדיין נשאר ב-scope אישי בפורטל עובד.
 */
export function canViewAllWorkflowRuns(session: SessionJwtPayload): boolean {
  if (isEmployeeRole(session)) return false;
  return canManageAllTasks(session);
}

export function strictUserId(session: SessionJwtPayload): string {
  return String(session.sub).trim();
}

export function workflowRunWhereForSession(
  session: SessionJwtPayload,
  managerView: boolean,
): { assigneeId: string } {
  if (managerView && canViewAllWorkflowRuns(session)) {
    throw new Error("workflowRunWhereForSession: use manager filters");
  }
  return { assigneeId: strictUserId(session) };
}

export function filterWorkflowRunsForUser<T extends { assigneeId?: string }>(
  rows: T[],
  userId: string,
): T[] {
  const uid = String(userId).trim();
  return rows.filter((r) => String(r.assigneeId ?? "").trim() === uid);
}

export function filterEmployeeTasksForUser<T extends { assignedToUserId?: string | null }>(
  rows: T[],
  userId: string,
): T[] {
  const uid = String(userId).trim();
  return rows.filter((r) => String(r.assignedToUserId ?? "").trim() === uid);
}

export function assertStrictAssignee(
  session: SessionJwtPayload,
  assigneeId: string,
): boolean {
  if (canViewAllWorkflowRuns(session)) return true;
  return String(assigneeId).trim() === strictUserId(session);
}

export function logStrictScope(
  tag: string,
  session: SessionJwtPayload,
  extra: Record<string, unknown>,
): void {
  console.log(tag, {
    currentUser: session.sub,
    role: session.role,
    strictIsolation: !canViewAllWorkflowRuns(session),
    ...extra,
  });
}
