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
      "CLOCK_IN_LATE",
      "TASK_COMPLETED",
      "TASK_OVERDUE",
      "TASK_LATE",
      "CHECK_DEPOSIT",
      "CHECK_DUE",
      "CHECK_DEPOSITED",
      "CHECK_BOUNCED",
      "FUTURE_ORDER",
      "CASHFLOW_SHORTAGE",
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
    case "CLOCK_IN_LATE":
    case "TASK_COMPLETED":
    case "TASK_OVERDUE":
    case "TASK_LATE":
    case "CHECK_DEPOSIT":
    case "CHECK_DUE":
    case "CHECK_DEPOSITED":
    case "CHECK_BOUNCED":
    case "FUTURE_ORDER":
    case "CASHFLOW_SHORTAGE":
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
