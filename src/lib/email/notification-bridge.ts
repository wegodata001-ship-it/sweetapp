/**
 * בניית תבניות מייל להתראות — השליחה עצמה ב-notification-email-pipeline.
 */
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/email/config";
import type { SystemEmailTemplate } from "@/lib/email/types";

export type NotificationEmailPayload = {
  notificationId: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: unknown;
  roleTarget: "ADMIN" | "EMPLOYEE" | "BOTH";
};

function meta(payload: NotificationEmailPayload): Record<string, unknown> {
  return (payload.metadata ?? {}) as Record<string, unknown>;
}

function absoluteUrl(path: string | null | undefined): string | undefined {
  const { appUrl } = getEmailConfig();
  if (!path?.trim()) return appUrl;
  if (path.startsWith("http")) return path;
  return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function entityFromMeta(m: Record<string, unknown>): { entityKey?: string; entityValue?: string } {
  for (const key of ["taskId", "checkId", "futureOrderId", "workDate", "broadcastId"]) {
    if (m[key] != null) return { entityKey: key, entityValue: String(m[key]) };
  }
  return {};
}

export async function buildEmailForNotification(
  payload: NotificationEmailPayload,
  _email: string,
): Promise<{ template: SystemEmailTemplate; subject: string; data: Record<string, unknown> } | null> {
  const { appUrl } = getEmailConfig();
  const m = meta(payload);
  const entities = entityFromMeta(m);

  switch (payload.type) {
    case "TASK_ASSIGNED": {
      const taskId = String(m.taskId ?? "");
      let taskTitle = payload.title;
      let priorityLabel = "בינונית";
      if (taskId) {
        const task = await prisma.employeeTask.findUnique({
          where: { id: taskId },
          select: { title: true, estimatedMinutes: true },
        });
        if (task?.title) taskTitle = task.title;
        if (task?.estimatedMinutes) priorityLabel = `${task.estimatedMinutes} דקות`;
      }
      return {
        template: "task-assigned",
        subject: "🆕 נוספה לך משימה חדשה",
        data: {
          ...entities,
          appUrl,
          taskTitle,
          managerName: "מנהל המערכת",
          deadline: "לפי לוח המשימות",
          priority: priorityLabel,
          actionUrl: absoluteUrl(payload.actionUrl ?? "/employee/tasks"),
        },
      };
    }
    case "TASK_COMPLETED": {
      const taskId = String(m.taskId ?? "");
      let taskTitle = payload.message;
      let employeeName = "עובד";
      if (m.employeeId) {
        const emp = await prisma.employee.findUnique({
          where: { id: String(m.employeeId) },
          select: { name: true },
        });
        if (emp?.name) employeeName = emp.name;
      }
      if (taskId) {
        const task = await prisma.employeeTask.findUnique({
          where: { id: taskId },
          select: { title: true, startedAt: true, completedAt: true },
        });
        if (task?.title) taskTitle = task.title;
        const completedAt = task?.completedAt?.toLocaleString("he-IL") ?? new Date().toLocaleString("he-IL");
        let duration: string | undefined;
        if (task?.startedAt && task?.completedAt) {
          const mins = Math.max(
            1,
            Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 60_000),
          );
          duration = `${mins} דקות`;
        }
        return {
          template: "task-completed",
          subject: "✅ העובד השלים משימה",
          data: {
            ...entities,
            appUrl,
            employeeName,
            taskTitle,
            completedAt,
            durationMinutes: duration,
            actionUrl: absoluteUrl(payload.actionUrl ?? "/admin/tasks"),
          },
        };
      }
      return {
        template: "task-completed",
        subject: "✅ העובד השלים משימה",
        data: {
          ...entities,
          appUrl,
          employeeName,
          taskTitle: payload.message,
          actionUrl: absoluteUrl(payload.actionUrl ?? "/admin/tasks"),
        },
      };
    }
    case "SHIFT_LATE":
    case "CLOCK_IN_LATE": {
      const isManager = payload.roleTarget === "ADMIN";
      let employeeName = "";
      const uid = String(m.subjectUserId ?? payload.recipientUserId);
      const u = await prisma.user.findUnique({
        where: { id: uid },
        select: { fullName: true },
      });
      employeeName = u?.fullName ?? "";
      return {
        template: "shift-late",
        subject: isManager ? "⚠️ עובד מאחר למשמרת" : "⏰ זוהה איחור למשמרת",
        data: {
          ...entities,
          appUrl,
          audience: isManager ? "manager" : "employee",
          employeeName: employeeName || undefined,
          lateMinutes: m.lateMinutes != null ? String(m.lateMinutes) : undefined,
          workDate: m.workDate != null ? String(m.workDate) : undefined,
          actionUrl: absoluteUrl(payload.actionUrl),
        },
      };
    }
    case "CHECK_DEPOSIT":
      return {
        template: "check-deposit",
        subject: "💰 יש צ'ק להפקדה",
        data: {
          ...entities,
          appUrl,
          customerName: payload.message.split("·")[0]?.trim() || "לקוח",
          amount: payload.message,
          dueDate: String(m.dueDate ?? "—"),
          status: "ממתין להפקדה",
          actionUrl: absoluteUrl(payload.actionUrl),
        },
      };
    case "FUTURE_ORDER":
      return {
        template: "future-order",
        subject: "📦 הזמנה עתידית מתקרבת",
        data: {
          ...entities,
          appUrl,
          customerName: payload.message.split("·")[0]?.trim() || "לקוח",
          eventDate: payload.message,
          amount: "",
          status: payload.message,
          orderNumber: m.orderNumber != null ? String(m.orderNumber) : undefined,
          actionUrl: absoluteUrl(payload.actionUrl ?? "/admin/future-orders"),
        },
      };
    case "NEW_UPDATE":
      return {
        template: "new-update",
        subject: "📢 עדכון חשוב מההנהלה",
        data: {
          ...entities,
          appUrl,
          title: payload.title,
          body: payload.message,
          actionUrl: absoluteUrl(payload.actionUrl),
        },
      };
    case "SYSTEM_ALERT":
      return {
        template: "system-alert",
        subject: payload.title,
        data: {
          ...entities,
          appUrl,
          title: payload.title,
          message: payload.message,
          actionUrl: absoluteUrl(payload.actionUrl),
        },
      };
    default:
      return null;
  }
}
