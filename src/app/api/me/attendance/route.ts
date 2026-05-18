import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { israelCalendarDateString, parseCalendarDateToDbDate } from "@/lib/staff/work-date";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const workDateStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(workDateStr);

  const [user, attendance, shift] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { hourlyRate: true, fullName: true },
    }),
    prisma.attendance.findUnique({
      where: { userId_workDate: { userId: session.sub, workDate } },
      include: { shift: true },
    }),
    prisma.workShift.findFirst({
      where: { userId: session.sub, workDate, status: "scheduled" },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const now = new Date();
  let liveWorkedMinutes = 0;
  if (attendance?.clockIn && !attendance.clockOut) {
    liveWorkedMinutes = Math.max(0, Math.round((now.getTime() - attendance.clockIn.getTime()) / 60_000));
  } else if (attendance?.workedMinutes != null) {
    liveWorkedMinutes = attendance.workedMinutes;
  }

  const rate = user?.hourlyRate ?? 0;
  const estimatedPay = (liveWorkedMinutes / 60) * rate;

  return NextResponse.json({
    ok: true,
    data: {
      workDate: workDateStr,
      user: { fullName: user?.fullName ?? "", hourlyRate: rate },
      shift: shift
        ? {
            id: shift.id,
            startTime: shift.startTime,
            endTime: shift.endTime,
            branch: shift.branch,
            notes: shift.notes,
          }
        : null,
      attendance: attendance
        ? {
            id: attendance.id,
            clockIn: attendance.clockIn.toISOString(),
            clockOut: attendance.clockOut?.toISOString() ?? null,
            workedMinutes: attendance.workedMinutes,
            lateMinutes: attendance.lateMinutes,
            overtimeMinutes: attendance.overtimeMinutes,
            isLate: attendance.isLate,
            hasOvertime: attendance.hasOvertime,
            note: attendance.note,
          }
        : null,
      liveWorkedMinutes,
      estimatedPay,
    },
  });
}
