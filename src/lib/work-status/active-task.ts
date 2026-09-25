import { prisma } from "@/lib/prisma";

/** מפעיל משימה אחת — סוגר קודמת ומעדכן User */
export async function activateEmployeeTask(userId: string, taskId: string) {
  const now = new Date();
  const task = await prisma.employeeTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("משימה לא נמצאה");
  const resuming = task.status === "DELAYED" || task.startedAt != null;
  await prisma.$transaction([
    prisma.employeeTask.update({
      where: { id: taskId },
      data: {
        status: "IN_PROGRESS",
        startedAt: task.startedAt ?? now,
        segmentStartedAt: now,
        isActive: true,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { activeTaskId: taskId, activeTaskStartedAt: resuming ? task.startedAt ?? now : now, lastSeenAt: now },
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
