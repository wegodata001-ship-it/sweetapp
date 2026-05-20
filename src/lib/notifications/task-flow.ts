import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients, notifyEmployee } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

const LOG = "[NOTIFICATION]";

/** מזהי User פעילים המקושרים לכרטיס Employee */
export async function resolveEmployeeUserIds(employeeId: string): Promise<string[]> {
  const empId = String(employeeId).trim();
  if (!empId) return [];

  const linked = await prisma.user.findMany({
    where: { employeeId: empId, isActive: true },
    select: { id: true, fullName: true },
  });
  if (linked.length > 0) {
    return linked.map((u) => u.id);
  }

  const asUser = await prisma.user.findUnique({
    where: { id: empId },
    select: { id: true, isActive: true },
  });
  if (asUser?.isActive) return [asUser.id];

  console.warn(`${LOG} no linked user for employeeId=${empId}`);
  return [];
}

export async function notifyTaskAssigned(params: {
  taskId: string;
  employeeId: string;
  title: string;
}): Promise<boolean> {
  const userIds = await resolveEmployeeUserIds(params.employeeId);
  if (!userIds.length) {
    console.warn(`${LOG} TASK_ASSIGNED skipped — no user`, params);
    return false;
  }

  const recipientUserId = userIds[0]!;
  const dup = await hasRecentNotification({
    type: "TASK_ASSIGNED",
    recipientUserId,
    metadataKey: "taskId",
    metadataValue: params.taskId,
    sinceHours: 72,
  });
  if (dup) {
    console.log(`${LOG} TASK_ASSIGNED deduped`, params.taskId);
    return false;
  }

  const message = `נוספה משימה: ${params.title}`;
  await notifyEmployee(recipientUserId, {
    type: "TASK_ASSIGNED",
    title: "נוספה לך משימה חדשה",
    message,
    priority: "MEDIUM",
    actionUrl: "/employee/tasks",
    subjectUserId: recipientUserId,
    metadata: {
      taskId: params.taskId,
      employeeId: params.employeeId,
      source: "task_assigned",
    },
  });

  console.log("[NOTIFICATION CREATED]", `${LOG} TASK_ASSIGNED`, {
    taskId: params.taskId,
    recipientUserId,
    message,
  });
  return true;
}

export async function notifyTaskCompleted(params: {
  taskId: string;
  employeeId: string;
  taskTitle: string;
  previousStatus: string;
}): Promise<boolean> {
  if (params.previousStatus === "COMPLETED") {
    console.log(`${LOG} TASK_COMPLETED skipped — already completed`, params.taskId);
    return false;
  }

  const dup = await hasRecentNotification({
    type: "TASK_COMPLETED",
    roleTarget: "ADMIN",
    metadataKey: "taskId",
    metadataValue: params.taskId,
    sinceHours: 168,
  });
  if (dup) {
    console.log(`${LOG} TASK_COMPLETED deduped`, params.taskId);
    return false;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: params.employeeId },
    select: { name: true },
  });
  const userIds = await resolveEmployeeUserIds(params.employeeId);
  let employeeName = employee?.name?.trim();
  if (!employeeName && userIds[0]) {
    const u = await prisma.user.findUnique({
      where: { id: userIds[0] },
      select: { fullName: true },
    });
    employeeName = u?.fullName?.trim();
  }
  employeeName = employeeName || "עובד";

  const adminIds = await listStaffAlertRecipientIds();
  if (!adminIds.length) {
    console.warn(`${LOG} TASK_COMPLETED skipped — no admin recipients`, params.taskId);
    return false;
  }

  const message = `העובד ${employeeName} סיים את המשימה '${params.taskTitle}'`;
  await notifyAdminRecipients(adminIds, {
    type: "TASK_COMPLETED",
    title: "משימה הושלמה",
    message,
    priority: "LOW",
    actionUrl: "/admin/tasks",
    subjectUserId: userIds[0] ?? null,
    metadata: {
      taskId: params.taskId,
      employeeId: params.employeeId,
      source: "task_completed",
    },
  });

  console.log("[NOTIFICATION CREATED]", `${LOG} TASK_COMPLETED`, {
    taskId: params.taskId,
    admins: adminIds.length,
    message,
  });
  return true;
}
