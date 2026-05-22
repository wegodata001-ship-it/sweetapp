import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

const HOURS_WINDOW = 48;

function hoursUntil(eventDate: Date): number {
  const now = Date.now();
  const target = new Date(eventDate);
  target.setHours(12, 0, 0, 0);
  return (target.getTime() - now) / 3_600_000;
}

/** הזמנות עתידיות שמתקרבות (48 שעות) */
export async function checkFutureOrders(): Promise<number> {
  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 3);

  const orders = await prisma.futureOrder.findMany({
    where: {
      isCompleted: false,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      eventDate: { gte: now, lte: maxDate },
    },
    take: 60,
  });

  const ids = await listStaffAlertRecipientIds();
  if (!ids.length) return 0;

  let sent = 0;
  for (const o of orders) {
    const h = hoursUntil(o.eventDate);
    if (h > HOURS_WINDOW || h < 0) continue;

    const dup = await hasRecentNotification({
      type: "FUTURE_ORDER",
      roleTarget: "ADMIN",
      metadataKey: "futureOrderId",
      metadataValue: o.id,
      sinceHours: 36,
    });
    if (dup) continue;

    const when = o.eventDate.toLocaleDateString("he-IL");
    const amount = o.totalAmount.toLocaleString("he-IL", { style: "currency", currency: "ILS" });

    await notifyAdminRecipients(ids, {
      type: "FUTURE_ORDER",
      title: "יש הזמנה עתידית שמתקרבת",
      message: `${o.customerName} · ${when} · ${amount} · ${o.status}`,
      priority: h <= 24 ? "HIGH" : "MEDIUM",
      actionUrl: "/admin/daily-orders",
      metadata: { futureOrderId: o.id, orderNumber: o.orderNumber, source: "check_future_orders" },
    });
    sent += 1;
  }
  return sent;
}
