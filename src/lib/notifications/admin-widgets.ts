import { prisma } from "@/lib/prisma";
import {
  hmToMinutes,
  israelCalendarDateString,
  minutesSinceMidnightIsrael,
  parseCalendarDateToDbDate,
} from "@/lib/staff/work-date";

const GRACE_MINUTES = 15;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type AdminNotificationWidgets = {
  lateEmployees: number;
  overdueTasks: number;
  pendingChecks: number;
  upcomingOrders: number;
};

/** ספירות לווידג'טים בדשבורד מנהל — ללא יצירת התראות */
export async function getAdminNotificationWidgets(): Promise<AdminNotificationWidgets> {
  const todayStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(todayStr);
  const nowMin = minutesSinceMidnightIsrael(new Date());
  const today = startOfToday();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 7);
  const orderMax = new Date();
  orderMax.setDate(orderMax.getDate() + 2);

  const [shifts, attendances, counts] = await Promise.all([
    prisma.workShift.findMany({
      where: { workDate, status: "scheduled" },
      include: { user: { select: { isActive: true } } },
    }),
    prisma.attendance.findMany({
      where: { workDate },
      select: { userId: true },
    }),
    prisma.$queryRaw<
      Array<{ overdue_tasks: number; pending_checks: number; upcoming_orders: number }>
    >`
      SELECT
        (SELECT count(*)::int FROM "TaskGroup"
          WHERE "dueDate" < ${today}
            AND status NOT IN ('COMPLETED', 'ARCHIVED')) AS overdue_tasks,
        (SELECT count(*)::int FROM "CheckPayment"
          WHERE status = 'PENDING' AND "dueDate" <= ${horizon}) AS pending_checks,
        (SELECT count(*)::int FROM "FutureOrder"
          WHERE "isCompleted" = false
            AND status NOT IN ('COMPLETED', 'CANCELLED')
            AND "eventDate" >= ${today}
            AND "eventDate" <= ${orderMax}) AS upcoming_orders
    `,
  ]);
  const overdueTasks = Number(counts[0]?.overdue_tasks ?? 0);
  const pendingChecks = Number(counts[0]?.pending_checks ?? 0);
  const upcomingOrders = Number(counts[0]?.upcoming_orders ?? 0);

  const attSet = new Set(attendances.map((a) => a.userId));
  let lateEmployees = 0;
  for (const s of shifts) {
    if (!s.user.isActive) continue;
    const start = hmToMinutes(s.startTime);
    if (start === null || nowMin < start + GRACE_MINUTES) continue;
    if (!attSet.has(s.userId)) lateEmployees += 1;
  }

  return {
    lateEmployees,
    overdueTasks,
    pendingChecks,
    upcomingOrders,
  };
}
