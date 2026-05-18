import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";
import { canManageAllTasks } from "@/lib/tasks/task-access";

export async function resolveEmployeeIdForUser(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { employeeId: true },
  });
  return u?.employeeId ?? null;
}

export async function assertEmployeeOwnsWorkTask(
  session: SessionJwtPayload,
  taskEmployeeId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; code?: string }> {
  if (canManageAllTasks(session)) return { ok: true };
  const eid = await resolveEmployeeIdForUser(session.sub);
  if (!eid) {
    return {
      ok: false,
      status: 403,
      error: "אין כרטיס עובד משויך לחשבון — פנה למנהל",
      code: "NO_EMPLOYEE_CARD",
    };
  }
  if (eid !== taskEmployeeId) {
    return {
      ok: false,
      status: 403,
      error: "לא ניתן לבצע פעולה על משימה שלא שייכת לך",
      code: "NOT_YOUR_TASK",
    };
  }
  return { ok: true };
}
