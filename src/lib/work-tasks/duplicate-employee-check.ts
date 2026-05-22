import { prisma } from "@/lib/prisma";

/**
 * אזהרה אם יותר ממשתמש User פעיל מקושר לאותו employeeId.
 * מקור לדליפת משימות כשמשתמשים ב־employeeId במקום assignedToUserId.
 */
export async function warnDuplicateEmployeeIds(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { employeeId: { not: null }, isActive: true },
    select: { id: true, employeeId: true, fullName: true },
  });

  const byEmployee = new Map<string, { id: string; fullName: string }[]>();
  for (const u of users) {
    const eid = String(u.employeeId).trim();
    if (!eid) continue;
    const list = byEmployee.get(eid) ?? [];
    list.push({ id: u.id, fullName: u.fullName });
    byEmployee.set(eid, list);
  }

  for (const [employeeId, linked] of byEmployee) {
    if (linked.length > 1) {
      console.warn("[DANGER] Duplicate employeeId detected", {
        employeeId,
        userIds: linked.map((x) => x.id),
        names: linked.map((x) => x.fullName),
      });
    }
  }
}

import { resolveSingleUserForEmployeeFast } from "@/lib/work-tasks/employee-assignee-cache";

/** משתמש User יחיד לכרטיס עובד — נדרש להקצאת משימות (עם cache, בלי סריקת DB מלאה) */
export async function resolveSingleUserForEmployee(employeeId: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; code: "NO_USER" | "DUPLICATE_USER" }
> {
  return resolveSingleUserForEmployeeFast(employeeId);
}
