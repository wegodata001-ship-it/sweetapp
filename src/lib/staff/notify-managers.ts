import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/** מנהלים שיקבלו התראות: SUPER_ADMIN + כל מי שיש לו הרשאת tasks */
export async function listStaffAlertRecipientIds(): Promise<string[]> {
  const supers = await prisma.user.findMany({
    where: { role: UserRole.SUPER_ADMIN, isActive: true },
    select: { id: true },
  });
  const withTasks = await prisma.userPermission.findMany({
    where: { permission: "tasks" },
    select: { userId: true },
  });
  return [...new Set([...supers.map((s) => s.id), ...withTasks.map((t) => t.userId)])];
}
