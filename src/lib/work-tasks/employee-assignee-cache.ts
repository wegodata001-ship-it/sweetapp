import { prisma } from "@/lib/prisma";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { userId: string; expires: number }>();

export function invalidateEmployeeAssigneeCache(employeeId?: string): void {
  if (employeeId) cache.delete(employeeId);
  else cache.clear();
}

/** משתמש יחיד לעובד — עם cache, בלי סריקת כל ה-DB */
export async function resolveSingleUserForEmployeeFast(employeeId: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; code: "NO_USER" | "DUPLICATE_USER" }
> {
  const hit = cache.get(employeeId);
  if (hit && hit.expires > Date.now()) {
    return { ok: true, userId: hit.userId };
  }

  const linked = await prisma.user.findMany({
    where: { employeeId, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (linked.length === 0) {
    return {
      ok: false,
      error: "לעובד אין משתמש מקושר — קשרו User לפני הקצאת משימות",
      code: "NO_USER",
    };
  }
  if (linked.length > 1) {
    return {
      ok: false,
      error: "לכרטיס העובד מקושרים מספר משתמשים — יש לתקן לפני הקצאה",
      code: "DUPLICATE_USER",
    };
  }

  const userId = linked[0]!.id;
  cache.set(employeeId, { userId, expires: Date.now() + TTL_MS });
  return { ok: true, userId };
}
