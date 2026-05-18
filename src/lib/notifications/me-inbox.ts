import type { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";

/** סוגים שמותר לעובד לראות בתיבה שלו בלבד */
export const EMPLOYEE_INBOX_TYPES = new Set<string>([
  "TASK_ASSIGNED",
  "TASK_STARTED",
  "TASK_LATE",
  "TASK_GROUP_COMPLETED",
  "CLOCK_IN_LATE",
  "MISSED_CLOCK_OUT",
  "CLOCK_OUT",
  "CHECK_DEPOSITED",
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
    case "MISSED_CLOCK_IN":
    case "MISSED_CLOCK_OUT":
    case "CLOCK_OUT":
    case "OVERTIME":
      return "employees";
    case "TASK_ASSIGNED":
    case "TASK_STARTED":
    case "TASK_COMPLETED":
    case "TASK_LATE":
    case "TASK_GROUP_COMPLETED":
      return "tasks";
    case "CHECK_DUE":
    case "CHECK_DEPOSITED":
    case "CHECK_BOUNCED":
      return "finance";
    case "INVENTORY_LOW":
    case "INVENTORY_COUNT_INCOMPLETE":
      return "inventory";
    case "NEW_ORDER":
    case "ORDER_DELAYED":
      return "orders";
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

  const [rows, unreadCount] = await Promise.all([
    prismaAny.notification.findMany({
      where: {
        ...baseWhere,
        ...(onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        color: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
      },
    }) as Promise<MeRow[]>,
    prismaAny.notification.count({ where: unreadWhere }) as Promise<number>,
  ]);

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
    await prismaAny.notification.updateMany({
      where: { ...baseWhere, isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  }

  const clean = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  if (clean.length === 0) return { ok: false, error: "לא נשלחו מזהים" };

  await prismaAny.notification.updateMany({
    where: { id: { in: clean }, ...baseWhere },
    data: { isRead: true },
  });
  return { ok: true };
}
