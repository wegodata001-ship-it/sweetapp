import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** קבוצות משימות שעבר תאריך היעד ולא הושלמו */
export async function checkOverdueTasks(): Promise<number> {
  const today = startOfToday();
  const groups = await prisma.taskGroup.findMany({
    where: {
      dueDate: { lt: today },
      status: { notIn: ["COMPLETED", "ARCHIVED"] },
    },
    select: { id: true, title: true, dueDate: true, status: true },
    take: 50,
  });

  if (groups.length === 0) return 0;

  const ids = await listStaffAlertRecipientIds();
  if (!ids.length) return 0;

  let sent = 0;
  for (const g of groups) {
    const dup = await hasRecentNotification({
      type: "TASK_OVERDUE",
      roleTarget: "ADMIN",
      metadataKey: "taskGroupId",
      metadataValue: g.id,
      sinceHours: 48,
    });
    if (dup) continue;

    const due = g.dueDate
      ? g.dueDate.toLocaleDateString("he-IL")
      : "—";
    await notifyAdminRecipients(ids, {
      type: "TASK_OVERDUE",
      title: "משימה באיחור",
      message: `${g.title} — יעד ${due} (סטטוס: ${g.status})`,
      priority: "HIGH",
      actionUrl: `/admin/tasks?group=${g.id}`,
      metadata: { taskGroupId: g.id, source: "check_overdue_tasks" },
    });
    sent += 1;
  }
  return sent;
}
