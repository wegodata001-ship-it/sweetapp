import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";

/** מנהלי פלטפורמה — פעולות על כל המשימות (כולל בשם עובד) */
export function isPlatformAdmin(session: SessionJwtPayload): boolean {
  return session.role === "SUPER_ADMIN" || session.role === "ADMIN";
}

export function canManageAllTasks(session: SessionJwtPayload): boolean {
  return isPlatformAdmin(session) || session.permissions.includes("tasks");
}

export function hasWorkerPortal(session: SessionJwtPayload): boolean {
  return session.role === "SUPER_ADMIN" || session.permissions.includes("employee_clock");
}

/**
 * כל מזהי assignee שמייצגים את אותו עובד/משתמש (User.id, כרטיס Employee ב־User.employeeId,
 * ומשתמשים נוספים שמקושרים לאותו כרטיס).
 */
export async function resolveEmployeeTaskAssigneeIdsForUser(userId: string): Promise<string[]> {
  const sub = String(userId).trim();
  const ids = new Set<string>([sub]);
  const me = await prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, employeeId: true },
  });
  if (!me) {
    return [...ids];
  }
  ids.add(String(me.id).trim());
  if (me.employeeId) {
    ids.add(String(me.employeeId).trim());
    const siblings = await prisma.user.findMany({
      where: { employeeId: me.employeeId, isActive: true },
      select: { id: true },
    });
    for (const s of siblings) {
      ids.add(String(s.id).trim());
    }
  }
  return [...ids];
}

/**
 * מרחיב את השדה `assigneeId` כפי שנשמר במסד (משימות עובד / ריצות וורקפלו):
 * - בדרך כלל User.id
 * - ייתכן מזהה כרטיס Employee (כאשר הוזן כך בעבר או מממשק אחר)
 */
export async function resolveEmployeeTaskAssigneeIdsForAssigneeField(assigneeField: string): Promise<string[]> {
  const raw = String(assigneeField).trim();
  const out = new Set<string>([raw]);

  const asUser = await prisma.user.findUnique({
    where: { id: raw },
    select: { id: true },
  });
  if (asUser) {
    for (const x of await resolveEmployeeTaskAssigneeIdsForUser(asUser.id)) {
      out.add(x);
    }
    return [...out];
  }

  const linkedUsers = await prisma.user.findMany({
    where: { employeeId: raw, isActive: true },
    select: { id: true },
  });
  for (const u of linkedUsers) {
    for (const x of await resolveEmployeeTaskAssigneeIdsForUser(u.id)) {
      out.add(x);
    }
  }
  return [...out];
}

/** האם המשתמש המחובר (כולל כרטיס Employee מקושר) הוא בעלים לוגיים של assigneeId במשימה/ריצה */
export async function viewerMayAccessTaskAssignee(
  session: SessionJwtPayload,
  assigneeField: string,
): Promise<boolean> {
  if (isPlatformAdmin(session)) return true;
  const sub = String(session.sub).trim();
  const myScope = new Set(await resolveEmployeeTaskAssigneeIdsForUser(sub));
  const taskScope = await resolveEmployeeTaskAssigneeIdsForAssigneeField(assigneeField);
  return taskScope.some((tid) => myScope.has(tid));
}
