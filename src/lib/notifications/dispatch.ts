import { prismaAny } from "@/lib/prisma";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import {
  priorityToColor,
  type NotificationPriorityLevel,
} from "@/lib/notifications/priority";
import { notificationPriorityColumnExists } from "@/lib/notifications/db-compat";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import {
  logNotificationCreated,
  logNotificationDeduped,
} from "@/lib/notifications/audit";
import { scheduleNotificationEmail } from "@/lib/email/notification-email-pipeline";
import { resolveEmailImportance } from "@/lib/email/importance";

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
  priority?: NotificationPriorityLevel;
  color?: string | null;
  actionUrl?: string | null;
  metadata?: unknown;
  /** מניעת כפילויות — אותו נמען + סוג + מפתח ב-metadata */
  dedupe?: {
    metadataKey: string;
    sinceHours?: number;
  };
};

const ENTITY_METADATA_KEYS = [
  "taskId",
  "checkId",
  "futureOrderId",
  "workDate",
  "shiftId",
  "broadcastId",
] as const;

function inferDedupeKey(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const k of ENTITY_METADATA_KEYS) {
    if (m[k] != null && String(m[k]).trim()) return k;
  }
  return null;
}

function rowColor(r: NotificationInsert): string {
  if (r.color?.trim()) return r.color.trim();
  return priorityToColor(r.priority ?? "MEDIUM");
}

/**
 * יצירת התראות — שורה לכל נמען (סימון נקרא/לא נקרא פר משתמש).
 * לא זורק חריגה — כדי לא לשבור זרימות עסקיות.
 */
export async function insertNotifications(rows: NotificationInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const hasPriority = await notificationPriorityColumnExists();
  for (const r of rows) {
    const dedupeKey = r.dedupe?.metadataKey ?? inferDedupeKey(r.metadata);
    const metaObj = (r.metadata ?? {}) as Record<string, unknown>;
    if (dedupeKey && metaObj[dedupeKey] != null) {
      const dup = await hasRecentNotification({
        type: r.type,
        recipientUserId: r.recipientUserId,
        roleTarget: r.roleTarget === "BOTH" ? undefined : r.roleTarget,
        subjectUserId: r.subjectUserId,
        metadataKey: dedupeKey,
        metadataValue: String(metaObj[dedupeKey]),
        sinceHours: r.dedupe?.sinceHours ?? 24,
      });
      if (dup) {
        logNotificationDeduped({
          type: r.type,
          recipientUserId: r.recipientUserId,
          metadataKey: dedupeKey,
          metadataValue: metaObj[dedupeKey],
        });
        continue;
      }
    }

    const priority = r.priority ?? "MEDIUM";
    const meta =
      r.metadata === undefined ? { priority } : { ...(r.metadata as object), priority };
    const base = {
      recipientUserId: r.recipientUserId,
      subjectUserId: r.subjectUserId ?? null,
      roleTarget: r.roleTarget,
      type: r.type,
      title: r.title,
      message: r.message,
      color: rowColor(r),
      isRead: false,
      actionUrl: r.actionUrl ?? null,
      metadata: meta as object,
    };
    try {
      const emailImportance = resolveEmailImportance({
        type: r.type,
        priority,
        roleTarget: r.roleTarget,
        metadata: metaObj,
      });
      let created: { id: string };
      try {
        created = (await prismaAny.notification.create({
          data: hasPriority
            ? { ...base, priority, emailImportance }
            : { ...base, emailImportance },
          select: { id: true },
        })) as { id: string };
      } catch {
        created = (await prismaAny.notification.create({
          data: hasPriority ? { ...base, priority } : base,
          select: { id: true },
        })) as { id: string };
      }
      logNotificationCreated({
        id: created.id,
        type: r.type,
        recipientUserId: r.recipientUserId,
        roleTarget: r.roleTarget,
        title: r.title,
        emailImportance,
      });
      scheduleNotificationEmail(
        {
          notificationId: created.id,
          recipientUserId: r.recipientUserId,
          type: r.type,
          title: r.title,
          message: r.message,
          actionUrl: r.actionUrl ?? null,
          metadata: meta,
          roleTarget: r.roleTarget,
        },
        priority,
      );
    } catch (e) {
      console.error("[insertNotifications] failed", { type: r.type, recipient: r.recipientUserId }, e);
    }
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
