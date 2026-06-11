import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyEmployeeAndManagers } from "@/lib/notifications/dispatch";
import { resolveEmployeeUserIds } from "@/lib/notifications/task-flow";

/** משימות עובד שעבר תאריך היעד — התראה לעובד + מנהלים */
export async function checkEmployeeOverdueTasks(): Promise<number> {
  const now = new Date();
  const tasks = await prisma.employeeTask.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      targetDueAt: { lt: now },
    },
    select: {
      id: true,
      title: true,
      employeeId: true,
      targetDueAt: true,
    },
    take: 50,
  });

  if (!tasks.length) return 0;

  let sent = 0;
  for (const task of tasks) {
    const userIds = await resolveEmployeeUserIds(task.employeeId);
    const recipientUserId = userIds[0];
    if (!recipientUserId) continue;

    const dup = await hasRecentNotification({
      type: "TASK_OVERDUE",
      recipientUserId,
      roleTarget: "EMPLOYEE",
      metadataKey: "taskId",
      metadataValue: task.id,
      sinceHours: 24,
    });
    if (dup) continue;

    const due = task.targetDueAt
      ? task.targetDueAt.toLocaleDateString("he-IL")
      : "—";

    await notifyEmployeeAndManagers(
      recipientUserId,
      {
        type: "TASK_OVERDUE",
        title: "משימה באיחור",
        message: `${task.title} — יעד ${due}`,
        priority: "HIGH",
        actionUrl: "/employee/tasks",
        subjectUserId: recipientUserId,
        metadata: { taskId: task.id, source: "employee_overdue_task" },
      },
      {
        type: "TASK_OVERDUE",
        title: "משימת עובד באיחור",
        message: `${task.title} — יעד ${due}`,
        priority: "HIGH",
        actionUrl: "/admin/tasks",
        subjectUserId: recipientUserId,
        metadata: { taskId: task.id, source: "employee_overdue_task" },
      },
    );
    sent += 1;
  }
  return sent;
}
