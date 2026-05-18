import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { getOrCreateActiveEmployeeWorkSession } from "@/lib/work-tasks/session";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, notifyEmployee, toneToColor } from "@/lib/notifications/dispatch";
import { computeLateOnClockIn } from "@/lib/staff/attendance-calc";
import { israelCalendarDateString, parseCalendarDateToDbDate } from "@/lib/staff/work-date";
import { requireDb } from "@/lib/api-route";
import { serializeWorkSession } from "@/lib/work-sessions/serialize";

/**
 * POST /api/me/work-session/clock-in
 *
 * Starts a new work session for the caller.
 *
 * Side-effects:
 *  - If today already has an open session → 400 (the user must clock-out first).
 *  - Always creates a `WorkSession` row.
 *  - Also keeps the legacy daily `Attendance` row in sync for the admin
 *    staff dashboard: creates one for the day if missing, leaves it alone
 *    on later sessions of the same day (re-clock-in after lunch, etc).
 *  - On a "late" first session of the day, fires a manager staff-alert.
 */
export async function POST(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;

  const workDateStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(workDateStr);

  try {
    const openExisting = await prismaAny.workSession.findFirst({
      where: { userId: session.sub, status: "ACTIVE" },
      select: { id: true },
    });
    if (openExisting) {
      return NextResponse.json(
        { ok: false, error: "כבר יש משמרת פתוחה" },
        { status: 400 },
      );
    }

    const clockIn = new Date();
    const created = await prismaAny.workSession.create({
      data: {
        userId: session.sub,
        workDate,
        clockIn,
        note,
        status: "ACTIVE",
      },
    });

    const userForTasks = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { employeeId: true },
    });
    if (userForTasks?.employeeId) {
      await getOrCreateActiveEmployeeWorkSession(userForTasks.employeeId);
    }

    // Keep legacy daily Attendance row in sync (used by the admin staff page).
    // We treat the first WorkSession of the day as the canonical "clock-in"
    // for the daily Attendance summary; subsequent sessions within the same
    // day do NOT overwrite it.
    const existingAttendance = await prisma.attendance.findUnique({
      where: { userId_workDate: { userId: session.sub, workDate } },
    });

    let lateForAlert: { isLate: boolean; lateMinutes: number } = {
      isLate: false,
      lateMinutes: 0,
    };

    if (!existingAttendance) {
      const shift = await prisma.workShift.findFirst({
        where: { userId: session.sub, workDate, status: "scheduled" },
        orderBy: { startTime: "asc" },
      });
      const late = computeLateOnClockIn(shift, clockIn);
      lateForAlert = late;
      await prisma.attendance.create({
        data: {
          userId: session.sub,
          shiftId: shift?.id ?? null,
          workDate,
          clockIn,
          isLate: late.isLate,
          lateMinutes: late.lateMinutes,
          note,
        },
      });
    } else if (existingAttendance.clockOut) {
      // Returning after a previous clock-out today — clear the clockOut on
      // the daily Attendance row so admin staff page reflects "in progress".
      await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          clockOut: null,
          workedMinutes: null,
          overtimeMinutes: 0,
          hasOvertime: false,
        },
      });
    }

    if (lateForAlert.isLate) {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { fullName: true },
      });
      const name = user?.fullName ?? "עובד";
      await notifyEmployee(session.sub, {
        type: "CLOCK_IN_LATE",
        title: "איחרת לכניסה",
        message: `איחרת ב־${lateForAlert.lateMinutes} דקות`,
        color: toneToColor("WARNING"),
        subjectUserId: session.sub,
        metadata: { source: "work_session" },
      });
      const ids = await listStaffAlertRecipientIds();
      const filtered = ids.filter((id) => id !== session.sub);
      if (filtered.length) {
        await notifyAdminRecipients(filtered, {
          type: "CLOCK_IN_LATE",
          title: `איחור — ${name}`,
          message: `${name} איחר ב־${lateForAlert.lateMinutes} דקות`,
          color: toneToColor("WARNING"),
          subjectUserId: session.sub,
          metadata: { source: "work_session" },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: serializeWorkSession(created),
    });
  } catch (e) {
    console.error("[POST /api/me/work-session/clock-in]", e);
    return NextResponse.json(
      { ok: false, error: "לא ניתן להתחיל יום עבודה" },
      { status: 500 },
    );
  }
}
