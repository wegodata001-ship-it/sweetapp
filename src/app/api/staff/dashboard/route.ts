import { NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { ensureMissedClockInAlertsForToday } from "@/lib/staff/missed-shift";
import { israelCalendarDateString, parseCalendarDateToDbDate } from "@/lib/staff/work-date";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";
import { isOpenShiftPastMax } from "@/lib/work-sessions/max-shift";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  await enforceMaxShiftLength();
  await ensureMissedClockInAlertsForToday();

  const todayStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(todayStr);

  const now = new Date();
  const [activeSessions, openAttendance, lateToday, overtimeToday, openTasks, shiftsToday, attendToday] =
    await Promise.all([
      prismaAny.workSession.findMany({
        where: { status: "ACTIVE", clockOut: null },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      prisma.attendance.findMany({
        where: { clockOut: null },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      prisma.attendance.findMany({
        where: { workDate, isLate: true },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      prisma.attendance.findMany({
        where: { workDate, hasOvertime: true },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      prisma.employeeTask.count({
        where: { status: { in: ["pending", "in_progress", "problem"] } },
      }),
      prisma.workShift.findMany({
        where: { workDate, status: "scheduled" },
        include: { user: { select: { id: true, fullName: true, isActive: true } } },
      }),
      prisma.attendance.findMany({
        where: { workDate },
        select: { userId: true },
      }),
    ]);

  const attendedSet = new Set(attendToday.map((a) => a.userId));
  const noClockIn = shiftsToday.filter((s) => s.user.isActive && !attendedSet.has(s.userId));

  const weekStart = new Date(workDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const workedAgg = await prisma.attendance.groupBy({
    by: ["userId"],
    where: {
      workDate: { gte: weekStart, lte: workDate },
      workedMinutes: { not: null },
    },
    _sum: { workedMinutes: true },
  });

  const userIds = [...new Set(workedAgg.map((w) => w.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  return NextResponse.json({
    ok: true,
    data: {
      date: todayStr,
      activeNow: [
        ...activeSessions
          .filter((a: { clockIn: Date }) => !isOpenShiftPastMax(a.clockIn, now))
          .map((a: { userId: string; clockIn: Date; user: { fullName: string } }) => ({
            userId: a.userId,
            name: a.user.fullName,
            clockIn: a.clockIn.toISOString(),
          })),
        ...openAttendance
          .filter(
            (a) =>
              !isOpenShiftPastMax(a.clockIn, now) &&
              !activeSessions.some((s: { userId: string }) => s.userId === a.userId),
          )
          .map((a) => ({
            userId: a.userId,
            name: a.user.fullName,
            clockIn: a.clockIn.toISOString(),
          })),
      ],
      lateToday: lateToday.map((a) => ({
        userId: a.userId,
        name: a.user.fullName,
        lateMinutes: a.lateMinutes,
      })),
      overtimeToday: overtimeToday.map((a) => ({
        userId: a.userId,
        name: a.user.fullName,
        minutes: a.overtimeMinutes,
      })),
      openTasksCount: openTasks,
      noClockIn: noClockIn.map((s) => ({
        userId: s.userId,
        name: s.user.fullName,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      workedLast7Days: workedAgg.map((w) => ({
        userId: w.userId,
        name: nameById.get(w.userId) ?? "",
        minutes: w._sum.workedMinutes ?? 0,
      })),
    },
  });
}
