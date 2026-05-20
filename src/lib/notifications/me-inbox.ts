import type { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import {
  notificationPriorityColumnExists,
  priorityFromMetadata,
} from "@/lib/notifications/db-compat";
import { logNotificationFetch, logNotificationRead } from "@/lib/notifications/audit";

/** סוגים שמותר לעובד לראות בתיבה שלו בלבד */
export const EMPLOYEE_INBOX_TYPES = new Set<string>([
  "TASK_ASSIGNED",
  "TASK_STARTED",
  "TASK_LATE",
  "TASK_GROUP_COMPLETED",
  "CLOCK_IN_LATE",
  "SHIFT_LATE",
  "MISSED_CLOCK_OUT",
  "CLOCK_OUT",
  "CHECK_DEPOSITED",
  "NEW_UPDATE",
]);

export type NotificationInboxSection =
  | "employees"
  | "tasks"
  | "finance"
  | "inventory"
  | "orders"
  | "other";

export function sectionForNotificationType(type: string): NotificationInboxSection {
  switch (type) {
    case "CLOCK_IN_LATE":
    case "SHIFT_LATE":
    case "MISSED_CLOCK_IN":
    case "MISSED_CLOCK_OUT":
    case "CLOCK_OUT":
    case "OVERTIME":
      return "employees";
    case "TASK_ASSIGNED":
    case "TASK_STARTED":
    case "TASK_COMPLETED":
    case "TASK_LATE":
    case "TASK_OVERDUE":
    case "TASK_GROUP_COMPLETED":
      return "tasks";
    case "CHECK_DUE":
    case "CHECK_DEPOSIT":
    case "CHECK_DEPOSITED":
    case "CHECK_BOUNCED":
      return "finance";
    case "INVENTORY_LOW":
    case "INVENTORY_COUNT_INCOMPLETE":
      return "inventory";
    case "NEW_ORDER":
    case "ORDER_DELAYED":
    case "FUTURE_ORDER":
      return "orders";
    case "NEW_UPDATE":
    case "SYSTEM_ALERT":
      return "other";
    default:
      return "other";
  }
}

export function isManagerRole(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

type MeRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  color: string | null;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: Date;
};

export async function listMeNotifications(params: {
  userId: string;
  role: UserRole;
  onlyUnread: boolean;
  take: number;
}): Promise<{ rows: MeRow[]; unreadCount: number; inbox: "employee" | "admin" }> {
  const { userId, role, onlyUnread, take } = params;
  const manager = isManagerRole(role);

  const baseWhere = manager
    ? { recipientUserId: userId, roleTarget: "ADMIN" as const }
    : {
        recipientUserId: userId,
        roleTarget: "EMPLOYEE" as const,
        type: { in: [...EMPLOYEE_INBOX_TYPES] },
      };

  const unreadWhere = {
    ...baseWhere,
    isRead: false,
  };

  const hasPriority = await notificationPriorityColumnExists();
  const select = hasPriority
    ? {
        id: true,
        type: true,
        title: true,
        message: true,
        priority: true,
        color: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
        metadata: true,
      }
    : {
        id: true,
        type: true,
        title: true,
        message: true,
        color: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
        metadata: true,
      };

  const [rawRows, unreadCount] = await Promise.all([
    prismaAny.notification.findMany({
      where: {
        ...baseWhere,
        ...(onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      select,
    }) as Promise<
      Array<{
        id: string;
        type: string;
        title: string;
        message: string;
        priority?: string;
        color: string | null;
        isRead: boolean;
        actionUrl: string | null;
        createdAt: Date;
        metadata?: unknown;
      }>
    >,
    prismaAny.notification.count({ where: unreadWhere }) as Promise<number>,
  ]);

  const rows: MeRow[] = rawRows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    priority: r.priority ?? priorityFromMetadata(r.metadata),
    color: r.color,
    isRead: r.isRead,
    actionUrl: r.actionUrl,
    createdAt: r.createdAt,
  }));

  logNotificationFetch({
    userId,
    role,
    inbox: manager ? "admin" : "employee",
    unreadCount,
    returned: rows.length,
    onlyUnread,
  });

  return {
    rows,
    unreadCount,
    inbox: manager ? "admin" : "employee",
  };
}

export async function markMeNotificationsRead(params: {
  userId: string;
  role: UserRole;
  ids?: string[];
  markAllRead?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, role, ids, markAllRead } = params;
  const manager = isManagerRole(role);
  const baseWhere = manager
    ? { recipientUserId: userId, roleTarget: "ADMIN" as const }
    : {
        recipientUserId: userId,
        roleTarget: "EMPLOYEE" as const,
        type: { in: [...EMPLOYEE_INBOX_TYPES] },
      };

  if (markAllRead) {
    const result = await prismaAny.notification.updateMany({
      where: { ...baseWhere, isRead: false },
      data: { isRead: true },
    });
    logNotificationRead({ userId, role, markAllRead: true, count: result.count });
    return { ok: true };
  }

  const clean = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  if (clean.length === 0) return { ok: false, error: "לא נשלחו מזהים" };

  const result = await prismaAny.notification.updateMany({
    where: { id: { in: clean }, ...baseWhere },
    data: { isRead: true },
  });
  logNotificationRead({ userId, role, ids: clean, count: result.count });
  return { ok: true };
}
