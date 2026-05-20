import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** צ'קים בסטטוס PENDING שמתקרבים לפירעון / עברו */
export async function checkPendingChecks(): Promise<number> {
  const today = startOfDay(new Date());
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 7);

  const checks = await prisma.checkPayment.findMany({
    where: {
      status: "PENDING",
      dueDate: { lte: horizon },
    },
    include: { customer: { select: { name: true } } },
    take: 80,
  });

  const ids = await listStaffAlertRecipientIds();
  if (!ids.length || checks.length === 0) return 0;

  let sent = 0;
  for (const c of checks) {
    const days = daysBetween(today, c.dueDate);
    const overdue = days < 0;
    const amount = c.amount.toLocaleString("he-IL", { style: "currency", currency: "ILS" });
    const due = c.dueDate.toLocaleDateString("he-IL");
    const cust = c.customer?.name ?? "לקוח";

    const dup = await hasRecentNotification({
      type: "CHECK_DEPOSIT",
      roleTarget: "ADMIN",
      metadataKey: "checkId",
      metadataValue: c.id,
      sinceHours: 24,
    });
    if (dup) continue;

    await notifyAdminRecipients(ids, {
      type: "CHECK_DEPOSIT",
      title: "יש צ'ק שממתין להפקדה",
      message: `${cust} · ${amount} · פירעון ${due}${overdue ? " (באיחור)" : ""}`,
      priority: overdue ? "HIGH" : days <= 2 ? "MEDIUM" : "LOW",
      actionUrl: `/finance/checks?highlight=${c.id}`,
      metadata: { checkId: c.id, dueDate: due, source: "check_pending_checks" },
    });
    sent += 1;
  }
  return sent;
}
