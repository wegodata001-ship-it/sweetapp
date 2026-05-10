import type { SessionJwtPayload } from "@/lib/auth/jwt";

export function canManageAllTasks(session: SessionJwtPayload): boolean {
  return session.role === "SUPER_ADMIN" || session.permissions.includes("tasks");
}

export function hasWorkerPortal(session: SessionJwtPayload): boolean {
  return session.role === "SUPER_ADMIN" || session.permissions.includes("employee_clock");
}

/** מנהל משימות או המשתמש שהוקצו לו המשימה (לפי session בלבד) */
export function assertCanAccessEmployeeTask(
  session: SessionJwtPayload | null,
  taskAssigneeId: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!session) return { ok: false, status: 401, error: "נדרשת התחברות" };
  if (canManageAllTasks(session)) return { ok: true };
  if (session.sub === taskAssigneeId) return { ok: true };
  return { ok: false, status: 403, error: "אין הרשאה" };
}
