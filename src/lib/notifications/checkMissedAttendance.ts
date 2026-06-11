import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import {
  notifyAdminRecipients,
  notifyEmployee,
  toneToColor,
} from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import {
  hmToMinutes,
  israelCalendarDateString,
  minutesSinceMidnightIsrael,
  parseCalendarDateToDbDate,
} from "@/lib/staff/work-date";

const GRACE_AFTER_SHIFT_END_MINUTES = 30;

/** עובדים שלא דיווחו כניסה/יציאה לפי משמרת מתוכננת */
export async function checkMissedAttendance(): Promise<{ missedIn: number; missedOut: number }> {
  const todayStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(todayStr);
  const nowMin = minutesSinceMidnightIsrael(new Date());
  let missedIn = 0;
  let missedOut = 0;

  const shifts = await prisma.workShift.findMany({
    where: { workDate, status: "scheduled" },
    include: {
      user: { select: { id: true, fullName: true, isActive: true } },
    },
  });

  for (const s of shifts) {
    if (!s.user.isActive) continue;
    const start = hmToMinutes(s.startTime);
    const end = hmToMinutes(s.endTime);
    if (start === null || end === null) continue;

    const att = await prisma.attendance.findUnique({
      where: { userId_workDate: { userId: s.userId, workDate } },
    });

    if (nowMin >= start + 30 && !att?.clockIn) {
      const dup = await hasRecentNotification({
        type: "MISSED_CLOCK_IN",
        recipientUserId: s.userId,
        roleTarget: "EMPLOYEE",
        metadataKey: "workDate",
        metadataValue: todayStr,
        sinceHours: 36,
      });
      if (!dup) {
        await notifyEmployee(s.userId, {
          type: "MISSED_CLOCK_IN",
          title: "לא דווחה נוכחות",
          message: `לא בוצעה כניסה למשמרת ${s.startTime}`,
          priority: "HIGH",
          actionUrl: "/employee/clock",
          subjectUserId: s.userId,
          metadata: { workDate: todayStr, shiftId: s.id, source: "missed_clock_in" },
        });
        missedIn += 1;
      }

      const adminIds = await listStaffAlertRecipientIds();
      const filtered = adminIds.filter((id) => id !== s.userId);
      for (const adminId of filtered) {
        const adminDup = await hasRecentNotification({
          type: "MISSED_CLOCK_IN",
          recipientUserId: adminId,
          roleTarget: "ADMIN",
          subjectUserId: s.userId,
          metadataKey: "workDate",
          metadataValue: todayStr,
          sinceHours: 36,
        });
        if (adminDup) continue;
        await notifyAdminRecipients([adminId], {
          type: "MISSED_CLOCK_IN",
          title: "עובד לא דיווח נוכחות",
          message: `${s.user.fullName} — לא דווחה כניסה (משמרת ${s.startTime})`,
          priority: "HIGH",
          actionUrl: "/admin/staff",
          subjectUserId: s.userId,
          metadata: { workDate: todayStr, shiftId: s.id, source: "missed_clock_in" },
        });
        missedIn += 1;
      }
    }

    if (nowMin >= end + GRACE_AFTER_SHIFT_END_MINUTES && att?.clockIn && !att.clockOut) {
      const dup = await hasRecentNotification({
        type: "MISSED_CLOCK_OUT",
        recipientUserId: s.userId,
        roleTarget: "EMPLOYEE",
        metadataKey: "workDate",
        metadataValue: todayStr,
        sinceHours: 36,
      });
      if (!dup) {
        await notifyEmployee(s.userId, {
          type: "MISSED_CLOCK_OUT",
          title: "לא דווחה יציאה",
          message: `לא בוצעה יציאה ממשמרת ${s.endTime}`,
          priority: "HIGH",
          actionUrl: "/employee/clock",
          subjectUserId: s.userId,
          metadata: { workDate: todayStr, shiftId: s.id, source: "missed_clock_out" },
        });
        missedOut += 1;
      }

      const adminIds = await listStaffAlertRecipientIds();
      const filtered = adminIds.filter((id) => id !== s.userId);
      for (const adminId of filtered) {
        const adminDup = await hasRecentNotification({
          type: "MISSED_CLOCK_OUT",
          recipientUserId: adminId,
          roleTarget: "ADMIN",
          subjectUserId: s.userId,
          metadataKey: "workDate",
          metadataValue: todayStr,
          sinceHours: 36,
        });
        if (adminDup) continue;
        await notifyAdminRecipients([adminId], {
          type: "MISSED_CLOCK_OUT",
          title: "עובד לא דיווח יציאה",
          message: `${s.user.fullName} — לא דווחה יציאה (משמרת ${s.endTime})`,
          priority: "HIGH",
          actionUrl: "/admin/staff",
          subjectUserId: s.userId,
          metadata: { workDate: todayStr, shiftId: s.id, source: "missed_clock_out" },
        });
        missedOut += 1;
      }
    }
  }

  return { missedIn, missedOut };
}

export async function notifyEarlyClockOut(params: {
  userId: string;
  userName: string;
  earlyMinutes: number;
  shiftEndTime: string;
  workDate: string;
  attendanceId: string;
}): Promise<void> {
  const todayStr = params.workDate;
  const empDup = await hasRecentNotification({
    type: "CLOCK_OUT",
    recipientUserId: params.userId,
    roleTarget: "EMPLOYEE",
    metadataKey: "workDate",
    metadataValue: todayStr,
    sinceHours: 24,
  });
  if (!empDup) {
    await notifyEmployee(params.userId, {
      type: "CLOCK_OUT",
      title: "יציאה מוקדמת",
      message: `יצאת ${params.earlyMinutes} דקות לפני סוף המשמרת (${params.shiftEndTime})`,
      color: toneToColor("WARNING"),
      priority: "MEDIUM",
      actionUrl: "/me/dashboard",
      subjectUserId: params.userId,
      metadata: {
        workDate: todayStr,
        earlyMinutes: params.earlyMinutes,
        attendanceId: params.attendanceId,
        source: "early_clock_out",
      },
    });
  }

  const adminIds = await listStaffAlertRecipientIds();
  const filtered = adminIds.filter((id) => id !== params.userId);
  if (!filtered.length) return;

  const adminRecipients: string[] = [];
  for (const adminId of filtered) {
    const adminDup = await hasRecentNotification({
      type: "CLOCK_OUT",
      recipientUserId: adminId,
      roleTarget: "ADMIN",
      subjectUserId: params.userId,
      metadataKey: "workDate",
      metadataValue: todayStr,
      sinceHours: 24,
    });
    if (!adminDup) adminRecipients.push(adminId);
  }
  if (!adminRecipients.length) return;

  await notifyAdminRecipients(adminRecipients, {
    type: "CLOCK_OUT",
    title: `יציאה מוקדמת — ${params.userName}`,
    message: `${params.userName} — יציאה ${params.earlyMinutes} דקות לפני ${params.shiftEndTime}`,
    color: toneToColor("WARNING"),
    priority: "MEDIUM",
    actionUrl: "/admin/staff",
    subjectUserId: params.userId,
    metadata: {
      workDate: todayStr,
      earlyMinutes: params.earlyMinutes,
      attendanceId: params.attendanceId,
      source: "early_clock_out",
    },
  });
}
