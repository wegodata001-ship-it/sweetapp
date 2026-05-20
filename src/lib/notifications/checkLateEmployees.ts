import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients, notifyEmployee } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import {
  hmToMinutes,
  israelCalendarDateString,
  minutesSinceMidnightIsrael,
  parseCalendarDateToDbDate,
} from "@/lib/staff/work-date";

const GRACE_MINUTES = 15;

function lateMinutesFromShiftStart(startTime: string, nowMin: number): number {
  const start = hmToMinutes(startTime);
  if (start === null) return 0;
  return Math.max(0, nowMin - start);
}

/** עובדים שלא ביצעו CLOCK IN אחרי תחילת משמרת + חסד */
export async function checkLateEmployees(): Promise<{ admin: number; employee: number }> {
  const todayStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(todayStr);
  const nowMin = minutesSinceMidnightIsrael(new Date());
  let admin = 0;
  let employee = 0;

  const shifts = await prisma.workShift.findMany({
    where: { workDate, status: "scheduled" },
    include: {
      user: { select: { id: true, fullName: true, phone: true, isActive: true } },
    },
  });

  for (const s of shifts) {
    if (!s.user.isActive) continue;
    const start = hmToMinutes(s.startTime);
    if (start === null || nowMin < start + GRACE_MINUTES) continue;

    const att = await prisma.attendance.findUnique({
      where: { userId_workDate: { userId: s.userId, workDate } },
    });
    if (att) continue;

    const lateMin = lateMinutesFromShiftStart(s.startTime, nowMin);

    const empDup = await hasRecentNotification({
      type: "SHIFT_LATE",
      recipientUserId: s.userId,
      roleTarget: "EMPLOYEE",
      metadataKey: "workDate",
      metadataValue: todayStr,
      sinceHours: 36,
    });
    if (!empDup) {
      await notifyEmployee(s.userId, {
        type: "SHIFT_LATE",
        title: "איחרת למשמרת",
        message: `איחור של ${lateMin} דקות מהתחלת המשמרת (${s.startTime})`,
        priority: lateMin >= 30 ? "HIGH" : "MEDIUM",
        actionUrl: "/me/dashboard?late=1",
        subjectUserId: s.userId,
        metadata: { workDate: todayStr, lateMinutes: lateMin, shiftId: s.id, source: "check_late" },
      });
      employee += 1;
    }

    const ids = await listStaffAlertRecipientIds();
    const filtered = ids.filter((id) => id !== s.userId);
    if (!filtered.length) continue;

    const adminRecipients: string[] = [];
    for (const adminId of filtered) {
      const adminDup = await hasRecentNotification({
        type: "SHIFT_LATE",
        recipientUserId: adminId,
        roleTarget: "ADMIN",
        subjectUserId: s.userId,
        metadataKey: "workDate",
        metadataValue: todayStr,
        sinceHours: 36,
      });
      if (!adminDup) adminRecipients.push(adminId);
    }
    if (!adminRecipients.length) continue;

    const phone = s.user.phone?.trim();
    await notifyAdminRecipients(adminRecipients, {
      type: "SHIFT_LATE",
      title: "עובד מאחר למשמרת",
      message: `${s.user.fullName} — איחור ${lateMin} דקות (משמרת ${s.startTime})`,
      priority: lateMin >= 30 ? "HIGH" : "MEDIUM",
      actionUrl: phone ? `tel:${phone.replace(/\s/g, "")}` : "/admin/staff",
      subjectUserId: s.userId,
      metadata: { workDate: todayStr, lateMinutes: lateMin, shiftId: s.id, source: "check_late" },
    });
    admin += adminRecipients.length;
  }

  return { admin, employee };
}
