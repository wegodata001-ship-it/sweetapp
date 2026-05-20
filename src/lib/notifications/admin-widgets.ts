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

  const [shifts, attendances, overdueTasks, pendingChecks, upcomingOrders] = await Promise.all([
    prisma.workShift.findMany({
      where: { workDate, status: "scheduled" },
      include: { user: { select: { isActive: true } } },
    }),
    prisma.attendance.findMany({
      where: { workDate },
      select: { userId: true },
    }),
    prisma.taskGroup.count({
      where: {
        dueDate: { lt: today },
        status: { notIn: ["COMPLETED", "ARCHIVED"] },
      },
    }),
    prisma.checkPayment.count({
      where: { status: "PENDING", dueDate: { lte: horizon } },
    }),
    prisma.futureOrder.count({
      where: {
        isCompleted: false,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        eventDate: { gte: today, lte: orderMax },
      },
    }),
  ]);

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
