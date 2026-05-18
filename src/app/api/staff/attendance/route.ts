import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { parseCalendarDateToDbDate } from "@/lib/staff/work-date";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from")?.trim();
  const to = req.nextUrl.searchParams.get("to")?.trim();
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "נדרש from ו־to" }, { status: 400 });
  }

  const dFrom = parseCalendarDateToDbDate(from);
  const dTo = parseCalendarDateToDbDate(to);
  if (!Number.isFinite(dFrom.getTime()) || !Number.isFinite(dTo.getTime())) {
    return NextResponse.json({ ok: false, error: "תאריכים לא תקינים" }, { status: 400 });
  }

  const rows = await prisma.attendance.findMany({
    where: { workDate: { gte: dFrom, lte: dTo } },
    include: {
      user: { select: { id: true, fullName: true, email: true, hourlyRate: true } },
      shift: true,
    },
    orderBy: [{ workDate: "desc" }, { clockIn: "desc" }],
  });

  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      workDate: r.workDate.toISOString().slice(0, 10),
      clockIn: r.clockIn.toISOString(),
      clockOut: r.clockOut?.toISOString() ?? null,
      workedMinutes: r.workedMinutes,
      lateMinutes: r.lateMinutes,
      overtimeMinutes: r.overtimeMinutes,
      isLate: r.isLate,
      hasOvertime: r.hasOvertime,
      note: r.note,
      shiftId: r.shiftId,
      shift: r.shift
        ? {
            id: r.shift.id,
            startTime: r.shift.startTime,
            endTime: r.shift.endTime,
            branch: r.shift.branch,
          }
        : null,
    })),
  });
}
