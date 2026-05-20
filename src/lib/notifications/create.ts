import type { NotificationPriorityLevel } from "@/lib/notifications/priority";
import { priorityToColor } from "@/lib/notifications/priority";
import {
  insertNotifications,
  notifyAdminRecipients,
  notifyEmployee,
  type NotificationInsert,
} from "@/lib/notifications/dispatch";

export type CreateNotificationInput = NotificationInsert;

/** יצירה ידנית / מערכת — שורה בודדת */
export async function createNotification(row: CreateNotificationInput): Promise<void> {
  const priority = row.priority ?? "MEDIUM";
  await insertNotifications([
    {
      ...row,
      priority,
      color: row.color ?? priorityToColor(priority),
    },
  ]);
}

export async function createAdminBroadcast(
  recipientIds: string[],
  row: Omit<CreateNotificationInput, "recipientUserId" | "roleTarget">,
): Promise<void> {
  await notifyAdminRecipients(recipientIds, row);
}

export async function createEmployeeNotification(
  userId: string,
  row: Omit<CreateNotificationInput, "recipientUserId" | "roleTarget">,
): Promise<void> {
  await notifyEmployee(userId, row);
}
