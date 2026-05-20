import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/** מנהלים שיקבלו התראות: SUPER_ADMIN, ADMIN + מי שיש לו הרשאת tasks */
export async function listStaffAlertRecipientIds(): Promise<string[]> {
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    },
    select: { id: true },
  });
  const withTasks = await prisma.userPermission.findMany({
    where: { permission: "tasks" },
    select: { userId: true },
  });
  return [...new Set([...managers.map((s) => s.id), ...withTasks.map((t) => t.userId)])];
}
