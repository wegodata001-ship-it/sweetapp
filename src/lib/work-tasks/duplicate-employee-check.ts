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

/** משתמש User יחיד לכרטיס עובד — נדרש להקצאת משימות */
export async function resolveSingleUserForEmployee(employeeId: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; code: "NO_USER" | "DUPLICATE_USER" }
> {
  await warnDuplicateEmployeeIds();

  const linked = await prisma.user.findMany({
    where: { employeeId, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (linked.length === 0) {
    return {
      ok: false,
      error: "לעובד אין משתמש מקושר — קשרו User לפני הקצאת משימות",
      code: "NO_USER",
    };
  }
  if (linked.length > 1) {
    console.warn("[DANGER] Duplicate employeeId detected", {
      employeeId,
      userIds: linked.map((u) => u.id),
    });
    return {
      ok: false,
      error: "לכרטיס העובד מקושרים מספר משתמשים — יש לתקן לפני הקצאה",
      code: "DUPLICATE_USER",
    };
  }
  return { ok: true, userId: linked[0]!.id };
}
