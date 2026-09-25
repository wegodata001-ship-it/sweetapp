import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import {
  computeEarlyLeaveOnClockOut,
  computeOvertimeOnClockOut,
} from "@/lib/staff/attendance-calc";
import { israelCalendarDateString } from "@/lib/staff/work-date";
import { notifyEarlyClockOut } from "@/lib/notifications/checkMissedAttendance";
import { requireDb } from "@/lib/api-route";
import { claimWorkSessionCheckout } from "@/lib/work-sessions/auto-checkout";
import { notifyManagers } from "@/lib/notifications/dispatch";
import { serializeWorkSession } from "@/lib/work-sessions/serialize";

/**
 * POST /api/me/work-session/clock-out
 *
 * Ends the caller's currently-open work session.
 *
 * Side-effects:
 *  - Computes `totalMinutes` from clockIn → now.
 *  - Updates the legacy daily `Attendance` row's clock-out so the admin
 *    staff page sums the day correctly (we accumulate all ENDED sessions
 *    of the day into `workedMinutes`).
 *  - Fires a manager overtime alert if the scheduled shift was exceeded.
 *
 * After clock-out the employee layout (server-side guard) will redirect
 * them back to `/employee/clock`.
 */
export async function POST(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const noteExtra = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  try {
    const open = await prismaAny.workSession.findFirst({
      where: { userId: session.sub, status: "ACTIVE" },
      orderBy: { clockIn: "desc" },
    });
    if (!open) {
      return NextResponse.json(
        { ok: false, error: "אין משמרת פתוחה לסיום" },
        { status: 400 },
      );
    }

    const now = new Date();
    const mergedNote = [open.note, noteExtra].filter(Boolean).join(" — ") || null;
    const claim = await claimWorkSessionCheckout({
      sessionId: open.id,
      clockIn: open.clockIn,
      now,
      note: mergedNote,
    });
    const clockOut = claim.clockOut;

    const ended = await prismaAny.workSession.findUnique({ where: { id: open.id } });
    if (!ended?.clockOut) {
      return NextResponse.json(
        { ok: false, error: "אין משמרת פתוחה לסיום" },
        { status: 400 },
      );
    }
    if (!claim.claimed) {
      return NextResponse.json({
        ok: true,
        data: serializeWorkSession(ended),
      });
    }

    const taskUser = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { employeeId: true },
    });
    if (taskUser?.employeeId) {
      await prisma.employeeWorkSession.updateMany({
        where: { employeeId: taskUser.employeeId, status: "ACTIVE" },
        data: { endedAt: clockOut, status: "ENDED" },
      });
    }

    // Update legacy daily Attendance summary — accumulate all ENDED sessions
    // for that workDate so the admin page shows a single coherent total.
    const dailyTotals = await prismaAny.workSession.findMany({
      where: {
        userId: session.sub,
        workDate: open.workDate,
        status: "ENDED",
      },
      select: { totalMinutes: true, checkoutType: true },
    });
    const dailyMinutes = dailyTotals.reduce(
      (acc: number, r: { totalMinutes: number | null }) => acc + (r.totalMinutes ?? 0),
      0,
    );
    const dayCheckoutType = dailyTotals.some(
      (r: { checkoutType?: string | null }) => r.checkoutType === "AUTO_12_HOURS",
    )
      ? "AUTO_12_HOURS"
      : claim.checkoutType;

    const att = await prisma.attendance.findUnique({
      where: { userId_workDate: { userId: session.sub, workDate: open.workDate } },
      include: { shift: true },
    });
    let overtime = { hasOvertime: false, overtimeMinutes: 0 };
    if (att) {
      overtime = computeOvertimeOnClockOut(att.shift, clockOut);
      await prisma.attendance.update({
        where: { id: att.id },
        data: {
          clockOut,
          workedMinutes: dailyMinutes,
          overtimeMinutes: overtime.overtimeMinutes,
          hasOvertime: overtime.hasOvertime,
          note: mergedNote,
          checkoutType: dayCheckoutType,
        },
      });
    }

    if (claim.claimed && claim.checkoutType === "AUTO_12_HOURS") {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { fullName: true },
      });
      await notifyManagers(
        {
          type: "CLOCK_OUT",
          title: "יציאה אוטומטית",
          message: `המשמרת של ${user?.fullName ?? "עובד"} נסגרה אוטומטית לאחר 12 שעות.`,
          subjectUserId: session.sub,
          actionUrl: "/ops/team?tab=attendance",
          priority: "MEDIUM",
          metadata: { autoCheckoutId: `session:${open.id}`, source: "auto_12_hours" },
          dedupe: { metadataKey: "autoCheckoutId", sinceHours: 24 * 365 * 5 },
        },
        { excludeUserId: session.sub },
      );
    } else if (overtime.hasOvertime) {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { fullName: true },
      });
      const name = user?.fullName ?? "עובד";
      const ids = await listStaffAlertRecipientIds();
      const filtered = ids.filter((id) => id !== session.sub);
      if (filtered.length && att) {
        await notifyAdminRecipients(filtered, {
          type: "OVERTIME",
          title: `חריגת שעות — ${name}`,
          message: `${name} — חריגה של ${overtime.overtimeMinutes} דקות`,
          color: toneToColor("WARNING"),
          priority: "MEDIUM",
          subjectUserId: session.sub,
          metadata: { attendanceId: att.id, source: "work_session" },
        });
      }
    } else if (att?.shift) {
      const early = computeEarlyLeaveOnClockOut(att.shift, clockOut);
      if (early.isEarlyLeave) {
        const user = await prisma.user.findUnique({
          where: { id: session.sub },
          select: { fullName: true },
        });
        await notifyEarlyClockOut({
          userId: session.sub,
          userName: user?.fullName ?? "עובד",
          earlyMinutes: early.earlyMinutes,
          shiftEndTime: att.shift.endTime,
          workDate: israelCalendarDateString(),
          attendanceId: att.id,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: serializeWorkSession(ended),
    });
  } catch (e) {
    console.error("[POST /api/me/work-session/clock-out]", e);
    return NextResponse.json(
      { ok: false, error: "לא ניתן לסיים יום עבודה" },
      { status: 500 },
    );
  }
}
