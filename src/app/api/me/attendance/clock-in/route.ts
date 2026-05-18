import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, notifyEmployee, toneToColor } from "@/lib/notifications/dispatch";
import { computeLateOnClockIn } from "@/lib/staff/attendance-calc";
import { israelCalendarDateString, parseCalendarDateToDbDate } from "@/lib/staff/work-date";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : undefined;

  const workDateStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(workDateStr);

  const existing = await prisma.attendance.findUnique({
    where: { userId_workDate: { userId: session.sub, workDate } },
  });
  if (existing) {
    if (!existing.clockOut) {
      return NextResponse.json({ ok: false, error: "כבר יש משמרת פתוחה להיום" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "כבר נרשמה נוכחות מלאה להיום" }, { status: 400 });
  }

  const shift = await prisma.workShift.findFirst({
    where: { userId: session.sub, workDate, status: "scheduled" },
    orderBy: { startTime: "asc" },
  });

  const clockIn = new Date();
  const late = computeLateOnClockIn(shift, clockIn);

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { fullName: true },
  });

  const att = await prisma.attendance.create({
    data: {
      userId: session.sub,
      shiftId: shift?.id ?? null,
      workDate,
      clockIn,
      isLate: late.isLate,
      lateMinutes: late.lateMinutes,
      note: note || null,
    },
  });

  if (late.isLate) {
    const name = user?.fullName ?? "עובד";
    await notifyEmployee(session.sub, {
      type: "CLOCK_IN_LATE",
      title: "איחרת לכניסה",
      message: `איחרת ב־${late.lateMinutes} דקות`,
      color: toneToColor("WARNING"),
      subjectUserId: session.sub,
      metadata: { attendanceId: att.id, source: "attendance" },
    });
    const ids = await listStaffAlertRecipientIds();
    const filtered = ids.filter((id) => id !== session.sub);
    if (filtered.length) {
      await notifyAdminRecipients(filtered, {
        type: "CLOCK_IN_LATE",
        title: `איחור — ${name}`,
        message: `${name} איחר ב־${late.lateMinutes} דקות`,
        color: toneToColor("WARNING"),
        subjectUserId: session.sub,
        metadata: { attendanceId: att.id, source: "attendance" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: att.id,
      clockIn: att.clockIn.toISOString(),
      isLate: att.isLate,
      lateMinutes: att.lateMinutes,
    },
  });
}
