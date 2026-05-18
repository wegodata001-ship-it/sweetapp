import { prisma, prismaAny } from "@/lib/prisma";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import {
  hmToMinutes,
  israelCalendarDateString,
  minutesSinceMidnightIsrael,
  parseCalendarDateToDbDate,
} from "@/lib/staff/work-date";

const GRACE_MINUTES = 15;

/** יוצר התראות חד־פעמיות ליום — עובד עם משמרת מתוכננת שלא ביצע כניסה */
export async function ensureMissedClockInAlertsForToday(): Promise<void> {
  const todayStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(todayStr);
  const nowMin = minutesSinceMidnightIsrael(new Date());

  const shifts = await prisma.workShift.findMany({
    where: { workDate, status: "scheduled" },
    include: { user: { select: { id: true, fullName: true, isActive: true } } },
  });

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);

  for (const s of shifts) {
    if (!s.user.isActive) continue;
    const start = hmToMinutes(s.startTime);
    if (start === null || nowMin < start + GRACE_MINUTES) continue;

    const att = await prisma.attendance.findUnique({
      where: { userId_workDate: { userId: s.userId, workDate } },
    });
    if (att) continue;

    const dup = await prismaAny.notification.findFirst({
      where: {
        type: "MISSED_CLOCK_IN",
        subjectUserId: s.userId,
        roleTarget: "ADMIN",
        createdAt: { gte: since },
      },
    });
    if (dup) continue;

    const ids = await listStaffAlertRecipientIds();
    const filtered = ids.filter((id) => id !== s.userId);
    if (!filtered.length) continue;

    await notifyAdminRecipients(filtered, {
      type: "MISSED_CLOCK_IN",
      title: `לא התחיל משמרת — ${s.user.fullName}`,
      message: `${s.user.fullName} לא ביצע כניסה למרות משמרת (${s.startTime}–${s.endTime})`,
      color: toneToColor("DANGER"),
      subjectUserId: s.userId,
      metadata: { source: "missed_shift", workDate: todayStr },
    });
  }
}
