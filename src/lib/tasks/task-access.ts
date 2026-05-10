import { prisma } from "@/lib/prisma";
import type { SessionJwtPayload } from "@/lib/auth/jwt";

export function canManageAllTasks(session: SessionJwtPayload): boolean {
  return session.role === "SUPER_ADMIN" || session.permissions.includes("tasks");
}

export function hasWorkerPortal(session: SessionJwtPayload): boolean {
  return session.role === "SUPER_ADMIN" || session.permissions.includes("employee_clock");
}

export async function userOwnsEmployeeTask(
  sessionSub: string,
  taskEmployeeId: string,
): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: sessionSub },
    select: { employeeId: true },
  });
  return u?.employeeId === taskEmployeeId;
}

/** מנהל משימות או עובד שמשימה שייכת אליו */
export async function assertCanAccessEmployeeTask(
  session: SessionJwtPayload | null,
  taskEmployeeId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!session) return { ok: false, status: 401, error: "נדרשת התחברות" };
  if (canManageAllTasks(session)) return { ok: true };
  if (hasWorkerPortal(session) && (await userOwnsEmployeeTask(session.sub, taskEmployeeId))) {
    return { ok: true };
  }
  return { ok: false, status: 403, error: "אין הרשאה" };
}
