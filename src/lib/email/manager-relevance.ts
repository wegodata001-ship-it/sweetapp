import { prisma } from "@/lib/prisma";
import type { NotificationEmailPayload } from "@/lib/email/notification-bridge";

function meta(payload: NotificationEmailPayload): Record<string, unknown> {
  return (payload.metadata ?? {}) as Record<string, unknown>;
}

/** מנהל מקבל מייל רק על התראות רלוונטיות לתחום שלו */
export async function isManagerNotificationRelevant(
  managerUserId: string,
  payload: NotificationEmailPayload,
): Promise<boolean> {
  const m = meta(payload);
  const type = payload.type;

  const manager = await prisma.user.findUnique({
    where: { id: managerUserId },
    select: { id: true, role: true },
  });
  if (!manager) return false;

  if (manager.role === "SUPER_ADMIN") {
    return [
      "SHIFT_LATE",
      "TASK_COMPLETED",
      "CHECK_DEPOSIT",
      "FUTURE_ORDER",
      "SYSTEM_ALERT",
      "NEW_UPDATE",
      "MISSED_CLOCK_IN",
    ].includes(type);
  }

  if (m.requiresManagerApproval === true) {
    const assigner = m.assignedByUserId ?? m.publisherId;
    return !assigner || String(assigner) === managerUserId;
  }

  switch (type) {
    case "SHIFT_LATE":
    case "TASK_COMPLETED":
    case "CHECK_DEPOSIT":
    case "FUTURE_ORDER":
      return true;
    case "SYSTEM_ALERT":
      return true;
    case "NEW_UPDATE":
      return m.importantUpdate === true;
    default:
      return false;
  }
}

/** עובד — רק התראות שמיועדות אליו */
export function isEmployeeNotificationOwned(
  employeeUserId: string,
  payload: NotificationEmailPayload,
): boolean {
  if (payload.recipientUserId !== employeeUserId) return false;

  const m = meta(payload);
  if (m.directRecipientId && String(m.directRecipientId) !== employeeUserId) {
    return false;
  }

  switch (payload.type) {
    case "TASK_ASSIGNED":
    case "SHIFT_LATE":
    case "CLOCK_IN_LATE":
    case "TASK_OVERDUE":
    case "TASK_LATE":
    case "TASK_STARTED":
    case "TASK_GROUP_COMPLETED":
      return true;
    case "NEW_UPDATE":
      return m.importantUpdate === true || m.personalMessage === true;
    default:
      return m.personalMessage === true;
  }
}
