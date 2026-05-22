import { prisma } from "@/lib/prisma";

/** מפעיל משימה אחת — סוגר קודמת ומעדכן User */
export async function activateEmployeeTask(userId: string, taskId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.employeeTask.updateMany({
      where: { assignedToUserId: userId, status: "IN_PROGRESS", id: { not: taskId } },
      data: { status: "PENDING", startedAt: null, isActive: false },
    }),
    prisma.employeeTask.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", startedAt: now, isActive: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { activeTaskId: taskId, activeTaskStartedAt: now, lastSeenAt: now },
    }),
  ]);
}

export async function clearUserActiveTask(userId: string) {
  await prisma.$transaction([
    prisma.employeeTask.updateMany({
      where: { assignedToUserId: userId, isActive: true },
      data: { isActive: false },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { activeTaskId: null, activeTaskStartedAt: null },
    }),
  ]);
}

export async function touchUserPresence(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  });
}
