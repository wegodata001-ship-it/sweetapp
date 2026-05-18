import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import {
  computeOvertimeOnClockOut,
  diffMinutesClocked,
} from "@/lib/staff/attendance-calc";
import { requireDb } from "@/lib/api-route";
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

    const clockOut = new Date();
    const total = diffMinutesClocked(open.clockIn, clockOut);
    const mergedNote = [open.note, noteExtra].filter(Boolean).join(" — ") || null;

    const ended = await prismaAny.workSession.update({
      where: { id: open.id },
      data: {
        clockOut,
        totalMinutes: total,
        status: "ENDED",
        note: mergedNote,
      },
    });

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
      select: { totalMinutes: true },
    });
    const dailyMinutes = dailyTotals.reduce(
      (acc: number, r: { totalMinutes: number | null }) => acc + (r.totalMinutes ?? 0),
      0,
    );

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
        },
      });
    }

    if (overtime.hasOvertime) {
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
          subjectUserId: session.sub,
          metadata: { attendanceId: att.id, source: "work_session" },
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
