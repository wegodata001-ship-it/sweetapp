import { prismaAny } from "@/lib/prisma";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

/** ערכי UI — ממופים לצבע בפועל */
export type NotificationTone = "SUCCESS" | "WARNING" | "DANGER" | "INFO";

const TONE_HEX: Record<NotificationTone, string> = {
  SUCCESS: "#16a34a",
  WARNING: "#ca8a04",
  DANGER: "#dc2626",
  INFO: "#2563eb",
};

export function toneToColor(tone: NotificationTone): string {
  return TONE_HEX[tone];
}

export type NotificationInsert = {
  recipientUserId: string;
  subjectUserId?: string | null;
  roleTarget: "ADMIN" | "EMPLOYEE" | "BOTH";
  type: string;
  title: string;
  message: string;
  color?: string | null;
  actionUrl?: string | null;
  metadata?: unknown;
};

/**
 * יצירת התראות — שורה לכל נמען (סימון נקרא/לא נקרא פר משתמש).
 * לא זורק חריגה — כדי לא לשבור זרימות עסקיות.
 */
export async function insertNotifications(rows: NotificationInsert[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await prismaAny.notification.createMany({
      data: rows.map((r) => ({
        recipientUserId: r.recipientUserId,
        subjectUserId: r.subjectUserId ?? null,
        roleTarget: r.roleTarget,
        type: r.type,
        title: r.title,
        message: r.message,
        color: r.color ?? null,
        isRead: false,
        actionUrl: r.actionUrl ?? null,
        metadata: r.metadata === undefined ? undefined : (r.metadata as object),
      })),
    });
  } catch {
    /* התראות לא חוסמות */
  }
}

export async function notifyAdminRecipients(
  recipientIds: string[],
  row: Omit<NotificationInsert, "recipientUserId" | "roleTarget">,
): Promise<void> {
  const unique = [...new Set(recipientIds)].filter(Boolean);
  await insertNotifications(
    unique.map((recipientUserId) => ({
      recipientUserId,
      roleTarget: "ADMIN" as const,
      ...row,
    })),
  );
}

export async function notifyManagers(
  row: Omit<NotificationInsert, "recipientUserId" | "roleTarget">,
  options?: { excludeUserId?: string | null },
): Promise<void> {
  const ids = await listStaffAlertRecipientIds();
  const filtered = options?.excludeUserId ? ids.filter((id) => id !== options.excludeUserId) : ids;
  await notifyAdminRecipients(filtered, row);
}

export async function notifyEmployee(
  employeeUserId: string,
  row: Omit<NotificationInsert, "recipientUserId" | "roleTarget">,
): Promise<void> {
  if (!employeeUserId) return;
  await insertNotifications([
    {
      recipientUserId: employeeUserId,
      roleTarget: "EMPLOYEE",
      subjectUserId: row.subjectUserId ?? employeeUserId,
      ...row,
    },
  ]);
}

/** עובד + כל המנהלים — לאותו אירוע (למשל משימה באיחור) */
export async function notifyEmployeeAndManagers(
  employeeUserId: string,
  employeeRow: Omit<NotificationInsert, "recipientUserId" | "roleTarget" | "subjectUserId"> & {
    subjectUserId?: string | null;
  },
  managerRow: Omit<NotificationInsert, "recipientUserId" | "roleTarget">,
  options?: { excludeUserId?: string | null },
): Promise<void> {
  const emp: NotificationInsert = {
    recipientUserId: employeeUserId,
    roleTarget: "EMPLOYEE",
    subjectUserId: employeeRow.subjectUserId ?? employeeUserId,
    type: employeeRow.type,
    title: employeeRow.title,
    message: employeeRow.message,
    color: employeeRow.color ?? null,
    actionUrl: employeeRow.actionUrl ?? null,
    metadata: employeeRow.metadata,
  };
  const ids = await listStaffAlertRecipientIds();
  const filtered = options?.excludeUserId ? ids.filter((id) => id !== options.excludeUserId) : ids;
  const admins: NotificationInsert[] = filtered.map((recipientUserId) => ({
    recipientUserId,
    roleTarget: "ADMIN",
    subjectUserId: managerRow.subjectUserId ?? employeeUserId,
    type: managerRow.type,
    title: managerRow.title,
    message: managerRow.message,
    color: managerRow.color ?? null,
    actionUrl: managerRow.actionUrl ?? null,
    metadata: managerRow.metadata,
  }));
  await insertNotifications([emp, ...admins]);
}
