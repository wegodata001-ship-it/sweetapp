import { UserRole } from "@prisma/client";
import { prisma, prismaAny } from "@/lib/prisma";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { dispatchCheckAlert } from "@/lib/checks/notifiers";
import type { CheckNotificationKind } from "@/lib/checks/types";
import { daysUntilDue, startOfDay } from "@/lib/checks/helpers";
import { notifyEmployee, toneToColor } from "@/lib/notifications/dispatch";

type CheckRow = {
  id: string;
  customerId: string;
  customer: { id: string; name: string; phone: string | null } | null;
  checkNumber: string;
  amount: number;
  dueDate: Date;
  status: string;
};

function alertTitleAndBody(
  kind: CheckNotificationKind,
  c: CheckRow,
  opts?: { actorFullName?: string | null },
): { title: string; body: string } {
  const cust = c.customer?.name ?? "לקוח";
  const amount = c.amount.toLocaleString("he-IL", { style: "currency", currency: "ILS" });
  const due = c.dueDate.toLocaleDateString("he-IL");
  switch (kind) {
    case "due_in_7":
      return {
        title: `צ'ק לפירעון בעוד 7 ימים — ${cust}`,
        body: `צ'ק #${c.checkNumber} (${amount}) של ${cust} לפירעון בתאריך ${due}.`,
      };
    case "due_in_3":
      return {
        title: `צ'ק מתקרב לפירעון — ${cust}`,
        body: `צ'ק #${c.checkNumber} (${amount}) של ${cust} ייפרע בעוד 3 ימים (${due}).`,
      };
    case "due_today":
      return {
        title: `היום תאריך פירעון — ${cust}`,
        body: `צ'ק #${c.checkNumber} (${amount}) של ${cust} לפירעון היום (${due}).`,
      };
    case "overdue":
      return {
        title: `צ'ק עבר תאריך — ${cust}`,
        body: `צ'ק #${c.checkNumber} (${amount}) של ${cust} עבר את תאריך הפירעון (${due}).`,
      };
    case "bounced":
      return {
        title: `צ'ק חזר — ${cust}`,
        body: `צ'ק #${c.checkNumber} (${amount}) של ${cust} חזר.`,
      };
    case "deposited": {
      const actor = opts?.actorFullName?.trim();
      return {
        title: actor
          ? `${actor} סימן/ה צ'יק כהופקד — ${cust}`
          : `צ'ק הופקד — ${cust}`,
        body: `צ'ק #${c.checkNumber} (${amount}) של ${cust} סומן כהופקד.`,
      };
    }
  }
}

/**
 * שולח התראה אחת לסוג מסוים על צ'ק נתון.
 * הולך לאיומי האפיקים (Notification למנהלים + סטאבים) ושומר ל־CheckNotificationLog.
 *
 * דדופ: לא נשלח שוב התראה מאותו kind על אותו צ'ק באותו יום קלנדרי.
 */
export async function sendCheckAlert(params: {
  kind: CheckNotificationKind;
  check: CheckRow;
  /** אם null — יזוהו מנהלים מהמערכת */
  recipientUserIds?: string[];
  /** אם true — לא לבדוק דדופ יומי (אירוע ידני) */
  force?: boolean;
  /** מבצע ההפקדה — לעובד נשלח עותק אישי בלבד */
  actorUserId?: string | null;
  actorFullName?: string | null;
}): Promise<boolean> {
  const { kind, check, force } = params;

  if (!force) {
    const startToday = startOfDay(new Date());
    const exists = await prismaAny.checkNotificationLog.findFirst({
      where: {
        checkId: check.id,
        kind,
        createdAt: { gte: startToday },
      },
    });
    if (exists) return false;
  }

  const recipientUserIds = params.recipientUserIds ?? (await listStaffAlertRecipientIds());
  const { title, body } = alertTitleAndBody(kind, check, {
    actorFullName: params.actorFullName,
  });

  const channels = await dispatchCheckAlert({
    kind,
    checkId: check.id,
    title,
    body,
    recipientUserIds,
    phone: check.customer?.phone ?? null,
  });

  const hasDispatchTarget =
    channels.length > 0 ||
    recipientUserIds.length > 0 ||
    (kind === "deposited" && Boolean(params.actorUserId));
  if (!hasDispatchTarget) {
    return false;
  }

  try {
    await prismaAny.checkNotificationLog.create({
      data: {
        checkId: check.id,
        kind,
        channel: channels[0] ?? "staff_alert",
        message: body,
      },
    });
  } catch {
    /* לא חוסם */
  }

  if (kind === "deposited" && params.actorUserId) {
    const actor = await prisma.user.findUnique({
      where: { id: params.actorUserId },
      select: { role: true },
    });
    if (actor?.role === UserRole.EMPLOYEE) {
      await notifyEmployee(params.actorUserId, {
        type: "CHECK_DEPOSITED",
        title: "הצ'יק סומן כהופקד",
        message: body,
        color: toneToColor("SUCCESS"),
        metadata: { checkId: check.id, source: "check" },
      });
    }
  }

  return true;
}

/**
 * בדיקה יומית של כל הצ'קים הפתוחים — מפיקה התראות מתאימות:
 *  - due_in_7 / due_in_3 / due_today
 *  - overdue (LATE)
 *
 * משתמש בדדופ יומי כך שאם רץ פעמיים באותו יום — לא יצרו כפילויות.
 *
 * מחזירה גם מספר תזוזות סטטוס (לא משנה את הסטטוס במסד —
 * EXPIRED/LATE/DUE_TODAY הם תצוגות נגזרות מ־dueDate ו־status).
 */
export async function runDailyCheckNotifications(): Promise<{
  scanned: number;
  alertsSent: number;
  byKind: Record<CheckNotificationKind, number>;
}> {
  const openStatuses = ["PENDING", "DEPOSITED"];
  const now = new Date();

  const rows = (await prismaAny.checkPayment.findMany({
    where: { status: { in: openStatuses } },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
  })) as CheckRow[];

  let sent = 0;
  const byKind: Record<CheckNotificationKind, number> = {
    due_in_7: 0,
    due_in_3: 0,
    due_today: 0,
    overdue: 0,
    bounced: 0,
    deposited: 0,
  };
  const recipientUserIds = await listStaffAlertRecipientIds();

  for (const c of rows) {
    const d = daysUntilDue(c.dueDate, now);
    let kind: CheckNotificationKind | null = null;
    if (d < 0) kind = "overdue";
    else if (d === 0) kind = "due_today";
    else if (d === 3) kind = "due_in_3";
    else if (d === 7) kind = "due_in_7";
    if (!kind) continue;

    const ok = await sendCheckAlert({
      kind,
      check: c,
      recipientUserIds,
    });
    if (ok) {
      sent++;
      byKind[kind]++;
    }
  }

  return { scanned: rows.length, alertsSent: sent, byKind };
}
